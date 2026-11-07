import { parseSaldoMovilFromTexts } from '../telegram/parse-saldo';

const sample = [
  'Vendo saldo 120 a 150 Habana',
  'Compro 120 en 140',
  'Saldo 240 - 300',
  '360 420/450',
  'Vendo saldo 240 por 310',
];

const tiers = parseSaldoMovilFromTexts(sample);
if (!tiers) throw new Error('debía parsear saldo');

const by = Object.fromEntries(tiers.map((t) => [t.amount, t]));
assert(by[120]?.buy === 140 && by[120]?.sell === 150, `120: ${JSON.stringify(by[120])}`);
assert(by[240]?.buy === 300 && by[240]?.sell === 305, `240: ${JSON.stringify(by[240])}`);
assert(by[360]?.buy === 420 && by[360]?.sell === 450, `360: ${JSON.stringify(by[360])}`);

console.log('parse-saldo.check ok', tiers);

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
