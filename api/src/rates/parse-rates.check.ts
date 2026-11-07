import { parseRatesFromTexts } from '../telegram/parse-rates';

const sample = [
  'Compro USD a 920 Habana Vedado',
  'Vendo dolar 945 zona 10 de octubre',
  'Compro USDT 915',
  'Vendo usdt 930',
  'Compro zelle 905',
  'Vendo Zelle 925',
  'Vendo binance 928',
  'Compro binance 912',
  'EUR 1000/1020',
  'MLC 650 / 670',
  'Busco euro 1005',
];

const rates = parseRatesFromTexts(sample);
if (!rates) throw new Error('debía parsear algo');

const by = Object.fromEntries(rates.map((r) => [r.currency, r]));
assert(by.USD?.buy === 920 && by.USD?.sell === 945, `USD mal: ${JSON.stringify(by.USD)}`);
assert(by.ZELLE?.buy === 905 && by.ZELLE?.sell === 925, `ZELLE mal: ${JSON.stringify(by.ZELLE)}`);
assert(by.USDT?.buy === 915 && by.USDT?.sell === 930, `USDT mal: ${JSON.stringify(by.USDT)}`);
assert(by.BINANCE?.buy === 912 && by.BINANCE?.sell === 928, `BINANCE mal: ${JSON.stringify(by.BINANCE)}`);
assert(by.EUR?.buy === 1003 && by.EUR?.sell === 1020, `EUR mal: ${JSON.stringify(by.EUR)}`);
assert(by.MLC?.buy === 650 && by.MLC?.sell === 670, `MLC mal: ${JSON.stringify(by.MLC)}`);

// transferencia se ignora; sin especificar = efectivo
const mixed = parseRatesFromTexts([
  'Vendo USD transferencia 880',
  'Vendo USD efectivo 945',
  'USDT transf 900 / 910',
  'Vendo Zelle 1045',
  'Compro USDT a 1120',
]);
const mx = Object.fromEntries((mixed ?? []).map((r) => [r.currency, r]));
assert(mx.USD?.sell === 945, `USD cash: ${JSON.stringify(mx.USD)}`);
assert(mx.USDT?.buy === 1120 && mx.USDT?.sell === 1120, `USDT: ${JSON.stringify(mx.USDT)}`);
assert(mx.ZELLE?.sell === 1045, `ZELLE assume cash: ${JSON.stringify(mx.ZELLE)}`);

console.log('parse-rates.check ok');

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
