import { RATE_ORDER } from '../telegram/parse-rates';
import type {
  CurrencyPair,
  RatesResponse,
  SaldoTier,
} from './rates.service';

export type Snapshot = {
  rates: Array<Pick<CurrencyPair, 'currency' | 'buy' | 'sell'>>;
  saldoMovil: Array<Pick<SaldoTier, 'amount' | 'buy' | 'sell'>> | null;
  updatedAt: string;
};

export function toSnapshot(data: RatesResponse): Snapshot {
  return {
    rates: data.rates.map(({ currency, buy, sell }) => ({
      currency,
      buy,
      sell,
    })),
    saldoMovil: data.saldoMovil
      ? data.saldoMovil.map(({ amount, buy, sell }) => ({ amount, buy, sell }))
      : null,
    updatedAt: data.updatedAt,
  };
}

/** Completa el orden fijo; si falta una moneda, reusa la pasada anterior. */
export function mergeRates(
  live: CurrencyPair[],
  previous: Snapshot | null,
): CurrencyPair[] {
  const liveBy = new Map(live.map((r) => [r.currency, r]));
  const prevBy = new Map((previous?.rates ?? []).map((r) => [r.currency, r]));
  const out: CurrencyPair[] = [];
  for (const currency of RATE_ORDER) {
    const cur = liveBy.get(currency);
    if (cur) {
      out.push(cur);
      continue;
    }
    const prev = prevBy.get(currency);
    if (prev) {
      out.push({ currency, buy: prev.buy, sell: prev.sell });
    }
  }
  return out;
}

export function withChange(
  current: RatesResponse,
  previous: Snapshot | null,
): RatesResponse {
  if (!previous) {
    return {
      ...current,
      rates: current.rates.map((r) => ({ ...r, change: null })),
      saldoMovil: current.saldoMovil
        ? current.saldoMovil.map((t) => ({ ...t, change: null }))
        : null,
    };
  }

  const prevBy = new Map(previous.rates.map((r) => [r.currency, r]));
  const prevSaldo = new Map(
    (previous.saldoMovil ?? []).map((t) => [t.amount, t]),
  );

  return {
    ...current,
    rates: current.rates.map((r) => {
      const p = prevBy.get(r.currency);
      return {
        ...r,
        change: p
          ? { buy: round(r.buy - p.buy), sell: round(r.sell - p.sell) }
          : null,
      };
    }),
    saldoMovil: current.saldoMovil
      ? current.saldoMovil.map((t) => {
          const p = prevSaldo.get(t.amount);
          return {
            ...t,
            change: p
              ? { buy: round(t.buy - p.buy), sell: round(t.sell - p.sell) }
              : null,
          };
        })
      : null,
  };
}

function round(n: number) {
  return Math.round(n);
}
