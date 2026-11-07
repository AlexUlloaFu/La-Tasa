import { parseSaldoMovilFromTexts } from '../telegram/parse-saldo';

const sample = [
  'Vendo saldo 120 a 150 Habana',
  'Compro 120 en 140',
  'Saldo 240 - 300',
  'Vendo saldo 240 por 310',
];

const tiers = parseSaldoMovilFromTexts(sample);
if (!tiers) throw new Error('debía parsear saldo');

const by = Object.fromEntries(tiers.map((t) => [t.amount, t]));
assert(by[120]?.buy === 140 && by[120]?.sell === 150, `120: ${JSON.stringify(by[120])}`);
assert(by[240]?.buy === 300 && by[240]?.sell === 305, `240: ${JSON.stringify(by[240])}`);

// formato real del grupo (RP_VIP) — precio unitario 700, ignora bulk
const onlyX = parseSaldoMovilFromTexts([
  `Buenas tengo saldo en venta por cantidad
360 x 700
Más de 3 recargas (360 x 600)
Más de 5 recargas (360 x 550)
Mas de 10 recargas (360 x 500)
Acepto efectivo o transferencia`,
]);
const x360 = onlyX?.find((t) => t.amount === 360);
assert(x360?.sell === 700 && x360?.buy === 700, `360 x 700 → ${JSON.stringify(x360)}`);

console.log('parse-saldo.check ok', { tiers, x360 });

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
