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
  // ponytail: precio informal suele estar entre nominal y ~2×; afinar con datos reales.
  return price >= amount && price <= amount * 2.2;
}

/** Mediana compra/venta CUP por tramo 120 / 240 / 360. */
export function parseSaldoMovilFromTexts(texts: string[]): SaldoTier[] | null {
  const hits: Hit[] = [];

  for (const text of texts) {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;

    for (const amount of SALDO_TIERS) {
      const a = String(amount);

      // 120 145/150  |  120: 145-150  |  120 = 145 / 150
      const pairRe = new RegExp(
        `(?:saldo\\s*)?${a}\\s*(?:cup\\s*)?[=:\\-]?\\s*(\\d{3})\\s*[\\/\\-]\\s*(\\d{3})`,
        'gi',
      );
      for (const m of cleaned.matchAll(pairRe)) {
        const p1 = Number(m[1]);
        const p2 = Number(m[2]);
        if (!plausiblePrice(amount, p1) || !plausiblePrice(amount, p2)) continue;
        hits.push({ amount, side: 'buy', price: Math.min(p1, p2) });
        hits.push({ amount, side: 'sell', price: Math.max(p1, p2) });
      }

      // compro/vendo saldo 120 a 145
      const buyRe = new RegExp(
        `(?:compro|compra|busco|pago)\\s+(?:saldo\\s*)?(?:de\\s*)?${a}\\s*(?:cup\\s*)?(?:en|a|por|=|:)?\\s*(\\d{3})`,
        'gi',
      );
      for (const m of cleaned.matchAll(buyRe)) {
        const p = Number(m[1]);
        if (plausiblePrice(amount, p)) {
          hits.push({ amount, side: 'buy', price: p });
        }
      }

      const sellRe = new RegExp(
        `(?:vendo|venta|ofrezco)\\s+(?:saldo\\s*)?(?:de\\s*)?${a}\\s*(?:cup\\s*)?(?:en|a|por|=|:)?\\s*(\\d{3})`,
        'gi',
      );
      for (const m of cleaned.matchAll(sellRe)) {
        const p = Number(m[1]);
        if (plausiblePrice(amount, p)) {
          hits.push({ amount, side: 'sell', price: p });
        }
      }

      // saldo 120 - 145  |  120 - 145 (con mención saldo cerca o solo tramo conocido)
      const dashRe = new RegExp(
        `(?:saldo\\s*)?${a}\\s*[\\-–—]\\s*(\\d{3})(?!\\d)`,
        'gi',
      );
      for (const m of cleaned.matchAll(dashRe)) {
        const p = Number(m[1]);
        if (!plausiblePrice(amount, p)) continue;
        if (!/saldo/i.test(cleaned) && p === amount) continue;
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
