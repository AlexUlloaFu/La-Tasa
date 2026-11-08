import type { CurrencyPair } from '../rates/rates.service';
import { RATE_ORDER, type Currency, normalizeRateText } from './parse-rates';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// ponytail: qwen free en Groq; gpt-oss gasta tokens en reasoning si no se baja.
const DEFAULT_MODEL = 'qwen/qwen3.8-27b';

const SYSTEM = `Extract ONLY efectivo/cash CUP rates (Cuban informal FX). Currencies: USD,EUR,ZELLE,MLC,BINANCE,USDT.
buy=compro/busco. sell=vendo/tengo. In "1500 USD a 945" rate=945 not 1500.
CASH ONLY: efectivo, cash, en mano, domicilio, or unspecified (=cash).
REJECT transferencia/transf/transfer/xfer/por cuenta/bancario/% descuento — those are MORE expensive and wrong.
If a post lists both ("transf 1100 / efectivo 940"), keep ONLY 940.
In multilinea posts, ignore lines about TRANSFERENCIA CUP; keep USD/EUR cash lines.
USDT/BINANCE are their own cash CUP rates (often near USD but NOT a copy). Omit if only transfer quotes.
Ignore phones.
JSON only: {"rates":[{"currency":"USD","buy":910,"sell":945}]}
If one side only, buy=sell. Omit unclear.`;

type LlmRate = { currency?: string; buy?: number; sell?: number };

// ponytail: cooldown global tras 429; multi-instancia → Redis.
let coolUntil = 0;

function plausible(currency: Currency, n: number): boolean {
  if (currency === 'MLC') return n >= 400 && n <= 900;
  if (currency === 'EUR') return n >= 800 && n <= 1200;
  if (currency === 'USDT' || currency === 'BINANCE') return n >= 700 && n <= 1050;
  return n >= 700 && n <= 1100;
}

function toCurrency(raw: string): Currency | null {
  const t = raw.toUpperCase();
  return (RATE_ORDER as string[]).includes(t) ? (t as Currency) : null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Ms sugeridos por el error Groq ("try again in 8.34s"), default 10s. */
function retryAfterMs(errBody: string): number {
  const m = errBody.match(/try again in ([\d.]+)\s*s/i);
  if (!m) return 10_000;
  return Math.min(20_000, Math.ceil(Number(m[1]) * 1000) + 500);
}

/** Prioriza msgs con moneda+tasa; acorta para caber en ITPM free (~7k). */
function pickSample(texts: string[], maxChars: number): string {
  const scored = texts.map((t) => {
    const n = normalizeRateText(t).slice(0, 120);
    const f = n.toLowerCase();
    const cur = /usd|usdt|zelle|eur|€|mlc|binance|dolar/.test(f) ? 2 : 0;
    const num = /\d{3}/.test(n) ? 1 : 0;
    const verb = /compro|vendo|tengo|compra|venta|busco|pago/.test(f) ? 1 : 0;
    const cash = /efectivo|\bcash\b|en\s+mano|domicilio/.test(f) ? 1 : 0;
    const onlyXfer =
      /transferenc|\btransf\b|\btransfer\b/.test(f) &&
      !/efectivo|\bcash\b|en\s+mano/.test(f)
        ? -3
        : 0;
    return { n, score: cur + num + verb + cash + onlyXfer };
  });
  scored.sort((a, b) => b.score - a.score);
  const picks = scored.filter((s) => s.score >= 3).slice(0, 20);
  const list = (picks.length ? picks : scored.slice(0, 15)).map(
    (s, i) => `${i + 1}. ${s.n}`,
  );
  let out = '';
  for (const line of list) {
    if (out.length + line.length + 1 > maxChars) break;
    out += (out ? '\n' : '') + line;
  }
  return out;
}

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

function ratesFromPayload(parsed: { rates?: LlmRate[] }): CurrencyPair[] | null {
  const out: CurrencyPair[] = [];
  for (const row of parsed.rates ?? []) {
    const currency = toCurrency(String(row.currency ?? ''));
    if (!currency) continue;
    const buy = Math.round(Number(row.buy));
    const sell = Math.round(Number(row.sell));
    if (!Number.isFinite(buy) || !Number.isFinite(sell)) continue;
    if (!plausible(currency, buy) || !plausible(currency, sell)) continue;
    out.push({
      currency,
      buy: Math.min(buy, sell),
      sell: Math.max(buy, sell),
    });
  }
  out.sort(
    (a, b) => RATE_ORDER.indexOf(a.currency) - RATE_ORDER.indexOf(b.currency),
  );
  return out.length ? out : null;
}

async function callGroq(
  key: string,
  model: string,
  sample: string,
): Promise<string> {
  const payload: Record<string, unknown> = {
    model,
    temperature: 0,
    max_tokens: 400,
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `JSON cash CUP rates:\n${sample}`,
      },
    ],
  };
  if (model.includes('gpt-oss')) payload.reasoning_effort = 'low';

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    const e = new Error(`Groq ${res.status}: ${err.slice(0, 280)}`);
    (e as Error & { status?: number; body?: string }).status = res.status;
    (e as Error & { status?: number; body?: string }).body = err;
    throw e;
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string; reasoning?: string } }[];
  };
  const msg = data.choices?.[0]?.message;
  return (msg?.content || msg?.reasoning || '').trim();
}

/** Una llamada Groq (free) sobre el lote de msgs → tasas. Null si no hay key/cooldown. */
export async function parseRatesWithLlm(
  texts: string[],
): Promise<CurrencyPair[] | null> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key || !texts.length) return null;
  if (Date.now() < coolUntil) return null;

  const model = process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;
  // ~2.5k chars ≈ <1k tokens; free ITPM ~7k.
  let sample = pickSample(texts, 2_500);
  if (!sample) return null;

  let raw = '';
  try {
    raw = await callGroq(key, model, sample);
  } catch (err) {
    const status = (err as { status?: number }).status;
    const body = (err as { body?: string }).body ?? '';
    if (status !== 429) throw err;

    const wait = retryAfterMs(body);
    coolUntil = Date.now() + wait;
    await sleep(wait);
    // reintento más chico tras cooldown
    sample = pickSample(texts, 1_500);
    if (!sample) return null;
    try {
      raw = await callGroq(key, model, sample);
    } catch (err2) {
      const st2 = (err2 as { status?: number }).status;
      if (st2 === 429) {
        coolUntil = Date.now() + retryAfterMs((err2 as { body?: string }).body ?? '');
        return null;
      }
      throw err2;
    }
  }

  if (!raw) return null;
  const json = extractJsonObject(raw);
  if (!json) return null;

  try {
    return ratesFromPayload(JSON.parse(json) as { rates?: LlmRate[] });
  } catch {
    return null;
  }
}
