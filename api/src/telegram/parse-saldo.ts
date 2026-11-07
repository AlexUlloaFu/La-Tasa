export const SALDO_TIERS = [120, 240, 360] as const;
export type SaldoAmount = (typeof SALDO_TIERS)[number];

export type SaldoTier = {
  amount: SaldoAmount;
  buy: number;
  sell: number;
};

type Side = 'buy' | 'sell';
type Hit = { amount: SaldoAmount; side: Side; price: number };

function plausiblePrice(amount: SaldoAmount, price: number): boolean {
  // ponytail: 360 x 700 es común; techo ~2.5× nominal.
  return price >= amount && price <= amount * 2.5;
}

/** Quita líneas de descuento por volumen ("Más de 3 recargas…"). */
function stripBulkLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/m[aá]\s*s\s+de\s+\d+\s+recargas?/i.test(line))
    .join('\n');
}

/** Mediana compra/venta CUP por tramo 120 / 240 / 360. */
export function parseSaldoMovilFromTexts(texts: string[]): SaldoTier[] | null {
  const hits: Hit[] = [];

  for (const raw of texts) {
    const text = stripBulkLines(raw.replace(/[^\S\n]+/g, ' ').trim());
    if (!text) continue;

    for (const amount of SALDO_TIERS) {
      const a = String(amount);

      // Formato del grupo: "360 x 700"
      const xRe = new RegExp(`(?:saldo\\s*)?${a}\\s*[x×]\\s*(\\d{3,4})`, 'gi');
      for (const m of text.matchAll(xRe)) {
        const p = Number(m[1]);
        if (!plausiblePrice(amount, p)) continue;
        hits.push({ amount, side: 'sell', price: p });
      }

      const pairRe = new RegExp(
        `(?:saldo\\s*)?${a}\\s*(?:cup\\s*)?[=:\\-]?\\s*(\\d{3,4})\\s*[\\/\\-]\\s*(\\d{3,4})`,
        'gi',
      );
      for (const m of text.matchAll(pairRe)) {
        const p1 = Number(m[1]);
        const p2 = Number(m[2]);
        if (!plausiblePrice(amount, p1) || !plausiblePrice(amount, p2)) continue;
        hits.push({ amount, side: 'buy', price: Math.min(p1, p2) });
        hits.push({ amount, side: 'sell', price: Math.max(p1, p2) });
      }

      const buyRe = new RegExp(
        `(?:compro|compra|busco|pago)\\s+(?:saldo\\s*)?(?:de\\s*)?${a}\\s*(?:cup\\s*)?(?:en|a|por|=|:)?\\s*(\\d{3,4})`,
        'gi',
      );
      for (const m of text.matchAll(buyRe)) {
        const p = Number(m[1]);
        if (plausiblePrice(amount, p)) hits.push({ amount, side: 'buy', price: p });
      }

      const sellRe = new RegExp(
        `(?:vendo|venta|ofrezco)\\s+(?:saldo\\s*)?(?:de\\s*)?${a}\\s*(?:cup\\s*)?(?:en|a|por|=|:)?\\s*(\\d{3,4})`,
        'gi',
      );
      for (const m of text.matchAll(sellRe)) {
        const p = Number(m[1]);
        if (plausiblePrice(amount, p)) hits.push({ amount, side: 'sell', price: p });
      }

      const dashRe = new RegExp(
        `(?:saldo\\s*)?${a}\\s*[\\-–—]\\s*(\\d{3,4})(?!\\d)`,
        'gi',
      );
      for (const m of text.matchAll(dashRe)) {
        const p = Number(m[1]);
        if (!plausiblePrice(amount, p)) continue;
        if (!/saldo/i.test(text) && p === amount) continue;
        hits.push({ amount, side: 'buy', price: p });
        hits.push({ amount, side: 'sell', price: p });
      }
    }
  }

  const tiers: SaldoTier[] = [];
  for (const amount of SALDO_TIERS) {
    const buys = hits
      .filter((h) => h.amount === amount && h.side === 'buy')
      .map((h) => h.price);
    const sells = hits
      .filter((h) => h.amount === amount && h.side === 'sell')
      .map((h) => h.price);
    if (!buys.length && !sells.length) continue;

    const buy = median(buys.length ? buys : sells);
    const sell = median(sells.length ? sells : buys);
    tiers.push({
      amount,
      buy: Math.min(buy, sell),
      sell: Math.max(buy, sell),
    });
  }

  return tiers.length ? tiers : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}
