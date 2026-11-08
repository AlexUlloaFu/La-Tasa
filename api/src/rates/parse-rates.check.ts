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
  'Vendo USD transf 870 / efectivo 940',
  'Compro USD transferencia a 860',
]);
const mx = Object.fromEntries((mixed ?? []).map((r) => [r.currency, r]));
// sells cash 945+940 → 943; transfer 880/870/860 fuera; USDT 1120 fuera de banda
assert(mx.USD?.buy === 943 && mx.USD?.sell === 943, `USD cash: ${JSON.stringify(mx.USD)}`);
assert(!mx.USDT, `USDT inflado: ${JSON.stringify(mx.USDT)}`);
assert(!mx.BINANCE, `BINANCE no debía salir: ${JSON.stringify(mx.BINANCE)}`);
assert(mx.ZELLE?.sell === 1045, `ZELLE: ${JSON.stringify(mx.ZELLE)}`);

// multilínea: bloque transf no contamina USD cash
const multi = parseRatesFromTexts([
  '¡¡ COMPRO !!\n2. TRANSFERENCIA CUP\nCompro con 25% de descuento\n3. USD → 910 CUP\nEURO → 880\nPago en efectivo',
  'Vendo USDT transferencia 1200',
  'Vendo USDT a 930',
  'Compro USD a 920',
]);
const mu = Object.fromEntries((multi ?? []).map((r) => [r.currency, r]));
assert(mu.USD?.buy === 915, `multi USD: ${JSON.stringify(mu.USD)}`); // 910+920
assert(mu.USDT?.sell === 930 && mu.USDT?.buy === 930, `multi USDT cash: ${JSON.stringify(mu.USDT)}`);
assert(mu.EUR?.buy === 880, `multi EUR: ${JSON.stringify(mu.EUR)}`);

// cruce usd↔usdt → USDT CUP = USD × ratio
const cross = parseRatesFromTexts([
  'Compro USD a 920',
  'Vendo dolar 945',
  'Tengo usd por usdt al 1.03',
]);
const cx = Object.fromEntries((cross ?? []).map((r) => [r.currency, r]));
assert(cx.USD?.buy === 920 && cx.USD?.sell === 945, `cross USD: ${JSON.stringify(cx.USD)}`);
assert(cx.USDT?.buy === 948 && cx.USDT?.sell === 973, `cross USDT: ${JSON.stringify(cx.USDT)}`);

// formatos reales del grupo (cantidad ≠ tasa, emoji digits, multilínea)
const live = parseRatesFromTexts([
  'Tengo 1500 USD a 945.\nVoy hasta su casa.',
  'vendo 300 usd a 935,centro de ciudad',
  'Compro‼️\nUSD 💵 a 9️⃣1️⃣5️⃣\nZelle 🪙 a 9️⃣0️⃣0️⃣\nPago en efectivo',
  'Tengo 200 usd a 930  escribir al 51638223',
  'Vendo 100 USD banda azul a 930',
  '¡¡ COMPRO COMPRO COMPRO !!\nUSD 💵 → 910 CUP\nEURO 💶 → 880 CUP\nUSDT → 950 CUP',
]);
const lv = Object.fromEntries((live ?? []).map((r) => [r.currency, r]));
// buys 910+915→913; sells únicos 930,935,945→935
assert(lv.USD?.buy === 913 && lv.USD?.sell === 935, `live USD: ${JSON.stringify(lv.USD)}`);
assert(lv.ZELLE?.buy === 900, `live ZELLE: ${JSON.stringify(lv.ZELLE)}`);
assert(lv.EUR?.buy === 880, `live EUR: ${JSON.stringify(lv.EUR)}`);
assert(lv.USDT?.buy === 950, `live USDT: ${JSON.stringify(lv.USDT)}`);

console.log('parse-rates.check ok');

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
