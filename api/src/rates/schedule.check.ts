import { nextScanAt, SCAN_HOURS } from './schedule';

// 2026-11-07 11:00 Havana ≈ 16:00 UTC (EST, no DST in Nov)
const beforeNoon = new Date('2026-11-07T16:00:00Z');
const next = nextScanAt(beforeNoon);
const hourHavana = Number(
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Havana',
    hour: 'numeric',
    hour12: false,
  }).format(next),
);

assert(hourHavana === 12, `esperaba 12:00 Havana, got ${hourHavana}: ${next.toISOString()}`);
assert(SCAN_HOURS.length === 3, 'deben ser 3 slots');

console.log('schedule.check ok');

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
