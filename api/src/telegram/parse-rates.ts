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

/** Rangos CUP actuales; evita basura tipo USDT 653. */
function plausible(currency: Currency, n: number): boolean {
  if (currency === 'MLC') return n >= 400 && n <= 1500;
  // USD / EUR / Zelle / USDT / Binance en banda de efectivo informal
  return n >= 700 && n <= 2000;
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Solo efectivo. Sin especificar → efectivo.
 * ponytail: ventana local ~48 chars; mensajes mixtos cash+transf.
 */
function isTransferPrice(text: string, index: number, matchLen: number): boolean {
  const from = Math.max(0, index - 48);
  const to = Math.min(text.length, index + matchLen + 48);
  const ctx = fold(text.slice(from, to));
  const transfer = /transferenc|\btransf\b|\btransfer\b|\bxfer\b/.test(ctx);
  if (!transfer) return false;
  const cash = /efectivo|\bcash\b|en\s+mano/.test(ctx);
  return !cash;
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
  hits.push({ currency, side, value });
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
    const cleaned = fold(text.replace(/\s+/g, ' '));
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

/** Extrae compra/venta CUP por moneda desde texto libre de grupos. */
export function parseRatesFromTexts(texts: string[]): CurrencyPair[] | null {
  const hits: Hit[] = [];

  for (const text of texts) {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;

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

    const buyRe = new RegExp(
      `(?:compro|compra|busco|pago)\\s*${CURRENCY_RE}[^\\d]{0,24}${NUM_RE}`,
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

    const sellRe = new RegExp(
      `(?:vendo|venta|ofrezco)\\s*${CURRENCY_RE}[^\\d]{0,24}${NUM_RE}`,
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

    // mención suelta: "zelle 920", "binance: 915" (sin compro/vendo)
    const plainRe = new RegExp(
      `(?:^|[^a-z])${CURRENCY_RE}\\s*[=:]\\s*${NUM_RE}`,
      'gi',
    );
    for (const m of cleaned.matchAll(plainRe)) {
      const value = toNumber(m[2]);
      const currency = toCurrency(m[1]);
      const i = m.index ?? 0;
      pushHit(hits, cleaned, i, m[0].length, currency, 'buy', value);
      pushHit(hits, cleaned, i, m[0].length, currency, 'sell', value);
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
      return rs.length ? median(rs.map((n) => Math.round(n * 1000)) ) / 1000 : null;
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
    const buys = hits
      .filter((h) => h.currency === currency && h.side === 'buy')
      .map((h) => h.value);
    const sells = hits
      .filter((h) => h.currency === currency && h.side === 'sell')
      .map((h) => h.value);
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
