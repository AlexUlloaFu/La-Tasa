import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions';

export type TelegramEnv = {
  apiId: number;
  apiHash: string;
  session: string;
  sources: string[];
  days: number;
};

function parseSources(raw?: string): string[] {
  if (!raw?.trim()) return [];
  const text = raw.trim();
  const list: unknown = text.startsWith('[')
    ? JSON.parse(text)
    : text.split(',');
  if (!Array.isArray(list)) {
    throw new Error('TELEGRAM_SOURCE debe ser un JSON array de usernames');
  }
  return list
    .map((s) => String(s).trim().replace(/^@/, ''))
    .filter(Boolean);
}

export function readTelegramEnv(): TelegramEnv | null {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH?.trim();
  const session = process.env.TELEGRAM_SESSION?.trim();
  let sources: string[] = [];
  try {
    sources = parseSources(process.env.TELEGRAM_SOURCE);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return null;
  }
  const days = Math.max(1, Number(process.env.TELEGRAM_DAYS) || 3);

  if (!apiId || !apiHash || !session || !sources.length) return null;
  return { apiId, apiHash, session, sources, days };
}

export function createClient(
  env: Pick<TelegramEnv, 'apiId' | 'apiHash' | 'session'>,
) {
  return new TelegramClient(
    new StringSession(env.session),
    env.apiId,
    env.apiHash,
    { connectionRetries: 5 },
  );
}
