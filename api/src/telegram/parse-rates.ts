import type { CurrencyPair } from '../rates/rates.service';

export type Currency = CurrencyPair['currency'];

export const RATE_ORDER: Currency[] = [
  'USD',
  'EUR',
  'ZELLE',
  'MLC',
  'BINANCE',
  'USDT',
];

type Side = 'buy' | 'sell';

type Hit = {
  currency: Currency;
  side: Side;
  value: number;
};

// usdt/binance antes que usd
const CURRENCY_RE =
  '(usdt|tether|binance|bnb|zelle|usd|d[oó]lar(?:es)?|eur(?:o(?:s)?)?|€|mlc)';
const NUM_RE = '(\\d{3,4}(?:[.,]\\d+)?)';
/** Separador típico tasa: "a 945", "→ 910", "=915" */
const SEP_RE = '(?:a|al|=|:|@|->|→|⇒|➡)';

function toCurrency(raw: string): Currency | null {
  const t = raw.toLowerCase().replace('ó', 'o');
  if (t === 'usdt' || t === 'tether') return 'USDT';
  if (t === 'binance' || t === 'bnb') return 'BINANCE';
  if (t === 'zelle') return 'ZELLE';
  if (t === '€' || t.startsWith('eur')) return 'EUR';
  if (t === 'mlc') return 'MLC';
  if (t.startsWith('usd') || t.startsWith('dolar')) return 'USD';
  return null;
}

function toNumber(raw: string): number {
  return Math.round(Number(raw.replace(',', '.')));
}

/** Rangos CUP efectivo informal; corta transf inflada (USDT 1135, BINANCE 1275). */
function plausible(currency: Currency, n: number): boolean {
  if (currency === 'MLC') return n >= 400 && n <= 900;
  if (currency === 'EUR') return n >= 800 && n <= 1200;
  if (currency === 'USDT' || currency === 'BINANCE') return n >= 700 && n <= 1050;
  // USD / Zelle
  return n >= 700 && n <= 1100;
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** 9️⃣1️⃣5️⃣ / 9⃣1⃣5⃣ → 915 (mensajes Telegram). */
export function normalizeRateText(s: string): string {
  return s
    .replace(/(\d)\uFE0F?\u20E3/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const TRANSFER_SRC =
  'transferenc|\\btransf\\b|\\btransfer\\b|\\bxfer\\b|por\\s+cuenta|\\ba\\s+cuenta\\b|bancari|\\btpv\\b';
const CASH_SRC = 'efectivo|\\bcash\\b|en\\s+mano|domicilio';

function nearestKeyword(text: string, center: number, src: string): number {
  let best = Infinity;
  // ponytail: new RegExp cada vez — /g compartido rompe matchAll entre msgs
  for (const m of text.matchAll(new RegExp(src, 'gi'))) {
    const at = (m.index ?? 0) + m[0].length / 2;
    best = Math.min(best, Math.abs(at - center));
  }
  return best;
}

function lineAround(text: string, index: number): string {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const end = text.indexOf('\n', index);
  return text.slice(start, end < 0 ? text.length : end);
}

/**
 * Solo efectivo. Sin especificar → efectivo.
 * Línea solo-transf → fuera. Misma línea con ambos → gana la etiqueta más cerca.
 */
function isTransferPrice(text: string, index: number, matchLen: number): boolean {
  const f = fold(text);
  const center = index + matchLen / 2;
  const dCash = nearestKeyword(f, center, CASH_SRC);
  const dXfer = nearestKeyword(f, center, TRANSFER_SRC);

  const line = fold(lineAround(text, index));
  const lineCash = new RegExp(CASH_SRC, 'i').test(line);
  const lineXfer = new RegExp(TRANSFER_SRC, 'i').test(line);

  if (lineXfer && !lineCash) return true;
  if (lineCash && !lineXfer) return false;
  if (lineCash && lineXfer) return dXfer <= dCash;

  // línea sin etiqueta: si el post habla de transf, exige cash cerca del número
  if (dXfer === Infinity) return false;
  if (dCash === Infinity || dCash > 40) return true;
  return dXfer < dCash;
}

/** Quita cotizaciones lejos de la mediana (transf/outliers caros). */
function tightValues(values: number[]): number[] {
  if (values.length < 3) return values;
  const med = median(values);
  const kept = values.filter((v) => Math.abs(v - med) / med <= 0.08);
  return kept.length ? kept : values;
}

function pushHit(
  hits: Hit[],
  text: string,
  index: number,
  matchLen: number,
  currency: Currency | null,
  side: Side,
  value: number,
) {
  if (!currency || !plausible(currency, value)) return;
  if (isTransferPrice(text, index, matchLen)) return;
  // ponytail: varios regex pegan el mismo quote → sesgan la mediana
  if (hits.some((h) => h.currency === currency && h.side === side && h.value === value)) {
    return;
  }
  hits.push({ currency, side, value });
}

function pushBoth(
  hits: Hit[],
  text: string,
  index: number,
  matchLen: number,
  currency: Currency | null,
  value: number,
  side: Side | 'both',
) {
  if (side === 'both' || side === 'buy') {
    pushHit(hits, text, index, matchLen, currency, 'buy', value);
  }
  if (side === 'both' || side === 'sell') {
    pushHit(hits, text, index, matchLen, currency, 'sell', value);
  }
}

/** Hint de lado por verbos en el mensaje completo (posts multilínea). */
function messageSide(text: string): Side | 'both' {
  const f = fold(text);
  const buy = /\b(compro|compra|busco|pago)\b/.test(f);
  const sell = /\b(vendo|venta|ofrezco|tengo)\b/.test(f);
  if (buy && !sell) return 'buy';
  if (sell && !buy) return 'sell';
  return 'both';
}

/** Ratio USD↔USDT ~1.0x (no es precio CUP). */
function parseUsdUsdtRatios(texts: string[]): number[] {
  const out: number[] = [];
  const ratioNum = '(1[.,]\\d{1,3}|0[.,]\\d{2})';
  const patterns = [
    // "tengo usd por usdt al 1.03"
    new RegExp(
      `\\busd\\b.{0,24}(?:por|\\/|a|vs).{0,12}\\busdt\\b.{0,12}(?:al|a|=|:)?\\s*${ratioNum}`,
      'gi',
    ),
    new RegExp(
      `\\busdt\\b.{0,24}(?:por|\\/|a|vs).{0,12}\\busd\\b.{0,12}(?:al|a|=|:)?\\s*${ratioNum}`,
      'gi',
    ),
    // "usd/usdt 1.03" · "usdt/usd = 1.02"
    new RegExp(`\\busd\\s*[\\/:]\\s*usdt\\s*[=:]?\\s*${ratioNum}`, 'gi'),
    new RegExp(`\\busdt\\s*[\\/:]\\s*usd\\s*[=:]?\\s*${ratioNum}`, 'gi'),
  ];

  for (const text of texts) {
    const cleaned = fold(normalizeRateText(text));
    for (const re of patterns) {
      for (const m of cleaned.matchAll(re)) {
        const r = Number(m[1].replace(',', '.'));
        // ponytail: banda típica del cruce; fuera = basura
        if (r >= 0.95 && r <= 1.25) out.push(r);
      }
    }
  }
  return out;
}

export function mergeRateLists(
  primary: CurrencyPair[] | null | undefined,
  secondary: CurrencyPair[] | null | undefined,
): CurrencyPair[] | null {
  if (!primary?.length && !secondary?.length) return null;
  const map = new Map<Currency, CurrencyPair>();
  for (const r of secondary ?? []) map.set(r.currency, r);
  for (const r of primary ?? []) map.set(r.currency, r);
  const merged = RATE_ORDER.filter((c) => map.has(c)).map((c) => map.get(c)!);
  return merged.length ? merged : null;
}

/** Extrae compra/venta CUP por moneda desde texto libre de grupos. */
export function parseRatesFromTexts(texts: string[]): CurrencyPair[] | null {
  const hits: Hit[] = [];

  for (const text of texts) {
    const cleaned = normalizeRateText(text);
    if (!cleaned) continue;
    const sideHint = messageSide(cleaned);

    const pairRe = new RegExp(
      `${CURRENCY_RE}\\s*[:\\-]?\\s*${NUM_RE}\\s*[\\/\\-]\\s*${NUM_RE}`,
      'gi',
    );
    for (const m of cleaned.matchAll(pairRe)) {
      const currency = toCurrency(m[1]);
      const buy = toNumber(m[2]);
      const sell = toNumber(m[3]);
      const i = m.index ?? 0;
      pushHit(hits, cleaned, i, m[0].length, currency, 'buy', Math.min(buy, sell));
      pushHit(hits, cleaned, i, m[0].length, currency, 'sell', Math.max(buy, sell));
    }

    // "USD transf 870 / efectivo 940" → solo 940 (cash)
    const mixedXferCashRe = new RegExp(
      `${CURRENCY_RE}[^\\d]{0,32}?(?:transf\\w*|transfer\\w*|xfer)[^\\d]{0,12}${NUM_RE}\\s*[\\/\\-]\\s*(?:efectivo|cash)?\\s*${NUM_RE}`,
      'gi',
    );
    for (const m of cleaned.matchAll(mixedXferCashRe)) {
      const currency = toCurrency(m[1]);
      const cash = toNumber(m[3]);
      const i = m.index ?? 0;
      // ancla el hit al número cash (2º) para el filtro de distancia
      const cashAt = m[0].lastIndexOf(m[3]);
      pushBoth(hits, cleaned, i + cashAt, m[3].length, currency, cash, sideHint);
    }

    // "USD efectivo 945" / "efectivo USD 945"
    const cashLabelRe = new RegExp(
      `${CURRENCY_RE}[^\\d]{0,24}?(?:efectivo|\\bcash\\b|en\\s+mano)[^\\d]{0,12}${NUM_RE}`,
      'gi',
    );
    for (const m of cleaned.matchAll(cashLabelRe)) {
      pushBoth(
        hits,
        cleaned,
        m.index ?? 0,
        m[0].length,
        toCurrency(m[1]),
        toNumber(m[2]),
        sideHint,
      );
    }

    // "compro USD a 920" · posts con emoji entre verbo y tasa
    const buyRe = new RegExp(
      `(?:compro|compra|busco|pago)[^\\d]{0,80}?${CURRENCY_RE}[^\\d]{0,40}${NUM_RE}`,
      'gi',
    );
    for (const m of cleaned.matchAll(buyRe)) {
      pushHit(
        hits,
        cleaned,
        m.index ?? 0,
        m[0].length,
        toCurrency(m[1]),
        'buy',
        toNumber(m[2]),
      );
    }

    // "vendo 300 usd a 935" · "tengo 1500 USD a 945"
    const sellRe = new RegExp(
      `(?:vendo|venta|ofrezco|tengo)[^\\d]{0,80}?${CURRENCY_RE}[^\\d]{0,40}${NUM_RE}`,
      'gi',
    );
    for (const m of cleaned.matchAll(sellRe)) {
      pushHit(
        hits,
        cleaned,
        m.index ?? 0,
        m[0].length,
        toCurrency(m[1]),
        'sell',
        toNumber(m[2]),
      );
    }

    // "1500 USD a 945" sin verbo → oferta. Lookbehind evita "a 915 Zelle a 900".
    const qtyRe = new RegExp(
      `(?<!(?:a|al|=|:|@|->|→|⇒|➡)\\s)\\d{2,6}\\s*${CURRENCY_RE}[^\\d]{0,40}?${SEP_RE}\\s*${NUM_RE}`,
      'gi',
    );
    for (const m of cleaned.matchAll(qtyRe)) {
      pushHit(
        hits,
        cleaned,
        m.index ?? 0,
        m[0].length,
        toCurrency(m[1]),
        'sell',
        toNumber(m[2]),
      );
    }

    // "USD 💵 a 915" · "USD → 910 CUP" (lado por verbos del post)
    const plainRe = new RegExp(
      `(?:^|[^a-z])${CURRENCY_RE}[^\\d]{0,24}?${SEP_RE}\\s*${NUM_RE}`,
      'gi',
    );
    for (const m of cleaned.matchAll(plainRe)) {
      pushBoth(
        hits,
        cleaned,
        m.index ?? 0,
        m[0].length,
        toCurrency(m[1]),
        toNumber(m[2]),
        sideHint,
      );
    }
  }

  // "usd por usdt al 1.03" → USDT CUP = USD CUP × ratio
  const usdBuys = hits
    .filter((h) => h.currency === 'USD' && h.side === 'buy')
    .map((h) => h.value);
  const usdSells = hits
    .filter((h) => h.currency === 'USD' && h.side === 'sell')
    .map((h) => h.value);
  if (usdBuys.length || usdSells.length) {
    const usdBuy = median(usdBuys.length ? usdBuys : usdSells);
    const usdSell = median(usdSells.length ? usdSells : usdBuys);
    const ratio = (() => {
      const rs = parseUsdUsdtRatios(texts);
      return rs.length
        ? median(rs.map((n) => Math.round(n * 1000))) / 1000
        : null;
    })();
    if (ratio != null) {
      hits.push({
        currency: 'USDT',
        side: 'buy',
        value: Math.round(usdBuy * ratio),
      });
      hits.push({
        currency: 'USDT',
        side: 'sell',
        value: Math.round(usdSell * ratio),
      });
    }
  }

  const rates: CurrencyPair[] = [];

  for (const currency of RATE_ORDER) {
    const buys = tightValues(
      hits
        .filter((h) => h.currency === currency && h.side === 'buy')
        .map((h) => h.value),
    );
    const sells = tightValues(
      hits
        .filter((h) => h.currency === currency && h.side === 'sell')
        .map((h) => h.value),
    );
    if (!buys.length && !sells.length) continue;

    const buy = median(buys.length ? buys : sells);
    const sell = median(sells.length ? sells : buys);
    rates.push({
      currency,
      buy: Math.min(buy, sell),
      sell: Math.max(buy, sell),
    });
  }

  return rates.length ? rates : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}
