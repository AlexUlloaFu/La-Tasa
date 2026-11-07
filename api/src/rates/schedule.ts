/** Horas locales America/Havana: medianoche, mediodía, 6pm. */
export const SCAN_HOURS = [0, 12, 18] as const;
export const TZ = 'America/Havana';

type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function havanaParts(date = new Date()): Parts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const bag: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(date)) {
    if (type !== 'literal') bag[type] = value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour === '24' ? '0' : bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

/** Instant UTC de un wall-clock en Havana (sin deps de timezone). */
function havanaWallToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0,
): number {
  // ponytail: itera corrigiendo offset; techo OK para Cuba. Upgrade: Temporal/luxon.
  let g = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 5; i++) {
    const p = havanaParts(new Date(g));
    const asUtc = Date.UTC(
      p.year,
      p.month - 1,
      p.day,
      p.hour,
      p.minute,
      p.second,
    );
    const target = Date.UTC(year, month - 1, day, hour, minute, second);
    const diff = target - asUtc;
    g += diff;
    if (Math.abs(diff) < 1000) break;
  }
  return g;
}

export function nextScanAt(from = new Date()): Date {
  const p = havanaParts(from);
  const candidates: number[] = [];

  for (const h of SCAN_HOURS) {
    candidates.push(havanaWallToUtcMs(p.year, p.month, p.day, h));
  }

  // día siguiente 00:00 Havana
  const tip = havanaWallToUtcMs(p.year, p.month, p.day, 12) + 24 * 3600 * 1000;
  const t = havanaParts(new Date(tip));
  candidates.push(havanaWallToUtcMs(t.year, t.month, t.day, 0));

  const now = from.getTime();
  const next = candidates
    .filter((ms) => ms > now + 500)
    .sort((a, b) => a - b)[0];
  return new Date(next);
}

export function formatHavana(date: Date): string {
  return new Intl.DateTimeFormat('es-CU', {
    timeZone: TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
