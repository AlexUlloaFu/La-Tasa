import { withChange, type Snapshot } from './change';
import type { RatesResponse } from './rates.service';

const current: RatesResponse = {
  base: 'CUP',
  rates: [
    { currency: 'USD', buy: 930, sell: 950 },
    { currency: 'EUR', buy: 1000, sell: 1010 },
  ],
  saldoMovil: [
    { amount: 120, buy: 150, sell: 160 },
    { amount: 240, buy: 280, sell: 300 },
  ],
  updatedAt: '2026-11-07T18:00:00Z',
  sources: ['x'],
  provisional: false,
};

const previous: Snapshot = {
  rates: [
    { currency: 'USD', buy: 920, sell: 940 },
    { currency: 'EUR', buy: 1010, sell: 1020 },
  ],
  saldoMovil: [
    { amount: 120, buy: 140, sell: 150 },
    { amount: 240, buy: 290, sell: 310 },
  ],
  updatedAt: '2026-11-07T12:00:00Z',
};

const withPrev = withChange(current, previous);
const usd = withPrev.rates.find((r) => r.currency === 'USD')!;
assert(usd.change?.buy === 10 && usd.change?.sell === 10, 'USD delta');
const eur = withPrev.rates.find((r) => r.currency === 'EUR')!;
assert(eur.change?.buy === -10 && eur.change?.sell === -10, 'EUR delta');
const s120 = withPrev.saldoMovil?.find((t) => t.amount === 120)!;
assert(s120.change?.buy === 10 && s120.change?.sell === 10, 'saldo 120');
const s240 = withPrev.saldoMovil?.find((t) => t.amount === 240)!;
assert(s240.change?.buy === -10 && s240.change?.sell === -10, 'saldo 240');

const first = withChange(current, null);
assert(first.rates[0].change === null, 'sin pasada previa');

console.log('change.check ok');

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
