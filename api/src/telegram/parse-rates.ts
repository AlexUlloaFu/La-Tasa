import type { CurrencyPair } from '../rates/rates.service';

export type Currency = CurrencyPair['currency'];

type Side = 'buy' | 'sell';

type Hit = {
  currency: Currency;
  side: Side;
  value: number;
};

// usdt/binance antes que usd (si no, "usdt" matchea como usd)
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

function plausible(n: number): boolean {
  // ponytail: rango duro CUP informal; afinar si el mercado se sale.
  return n >= 100 && n <= 5000;
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
      if (!currency || !plausible(buy) || !plausible(sell)) continue;
      hits.push({ currency, side: 'buy', value: Math.min(buy, sell) });
      hits.push({ currency, side: 'sell', value: Math.max(buy, sell) });
    }

    const buyRe = new RegExp(
      `(?:compro|compra|busco|pago)\\s*${CURRENCY_RE}[^\\d]{0,20}${NUM_RE}`,
      'gi',
    );
    for (const m of cleaned.matchAll(buyRe)) {
      const currency = toCurrency(m[1]);
      const value = toNumber(m[2]);
      if (currency && plausible(value)) {
        hits.push({ currency, side: 'buy', value });
      }
    }

    const sellRe = new RegExp(
      `(?:vendo|venta|ofrezco)\\s*${CURRENCY_RE}[^\\d]{0,20}${NUM_RE}`,
      'gi',
    );
    for (const m of cleaned.matchAll(sellRe)) {
      const currency = toCurrency(m[1]);
      const value = toNumber(m[2]);
      if (currency && plausible(value)) {
        hits.push({ currency, side: 'sell', value });
      }
    }
  }

  const currencies: Currency[] = [
    'USD',
    'ZELLE',
    'USDT',
    'BINANCE',
    'EUR',
    'MLC',
  ];
  const rates: CurrencyPair[] = [];

  for (const currency of currencies) {
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
