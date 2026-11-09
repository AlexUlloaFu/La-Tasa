export type OpenWaEnv = {
  apiUrl: string;
  apiKey: string;
  sessionId: string;
  sources: string[];
  days: number;
};

export type OpenWaGroup = {
  id: string;
  name: string;
};

export type OpenWaMessage = {
  body?: unknown;
  text?: unknown;
  timestamp?: unknown;
  date?: unknown;
  createdAt?: unknown;
  chatId?: unknown;
  fromMe?: unknown;
  [key: string]: unknown;
};

export function parseOpenWaSources(raw?: string): string[] {
  if (!raw?.trim()) return [];
  const text = raw.trim();
  const list: unknown = text.startsWith('[') ? JSON.parse(text) : text.split(',');
  if (!Array.isArray(list) || list.some((item) => typeof item !== 'string')) {
    throw new Error('OPENWA_SOURCE debe ser una lista de nombres o JID de grupos');
  }
  return [...new Set(list.map((item) => item.trim()).filter(Boolean))];
}

export function readOpenWaEnv(): OpenWaEnv | null {
  const apiUrl = process.env.OPENWA_API_URL?.trim().replace(/\/+$/, '');
  const apiKey = process.env.OPENWA_API_KEY?.trim();
  const sessionId = process.env.OPENWA_SESSION_ID?.trim();
  const sources = parseOpenWaSources(process.env.OPENWA_SOURCE);
  const days = Math.max(1, Number(process.env.OPENWA_DAYS) || 3);

  if (!apiUrl || !apiKey || !sessionId || !sources.length) return null;
  return {
    apiUrl: /\/api$/i.test(apiUrl) ? apiUrl : `${apiUrl}/api`,
    apiKey,
    sessionId,
    sources,
    days,
  };
}

export class OpenWaClient {
  constructor(private readonly env: OpenWaEnv) {}

  async getSession(): Promise<{ status: string }> {
    const result = await this.request<unknown>(
      `/sessions/${encodeURIComponent(this.env.sessionId)}`,
    );
    if (!isRecord(result) || typeof result.status !== 'string') {
      throw new Error('OpenWA session response did not include a status');
    }
    return { status: result.status.trim().toLowerCase() };
  }

  async getGroups(): Promise<OpenWaGroup[]> {
    const result = await this.request<unknown>(
      `/sessions/${encodeURIComponent(this.env.sessionId)}/groups`,
    );
    return arrayFromPayload(result, ['groups', 'data', 'value', 'items']).map(
      (row, index) => {
        if (!isRecord(row)) {
          throw new Error(`OpenWA group at index ${index} is not an object`);
        }
        const id = typeof row.id === 'string' ? row.id.trim() : '';
        const name =
          typeof row.name === 'string'
            ? row.name.trim()
            : typeof row.subject === 'string'
              ? row.subject.trim()
              : '';
        if (!id) throw new Error(`OpenWA group at index ${index} has no id`);
        return { id, name: name || id };
      },
    );
  }

  async getMessages(chatId: string, limit = 200): Promise<OpenWaMessage[]> {
    const path = `/sessions/${encodeURIComponent(this.env.sessionId)}/messages`;
    const query = new URLSearchParams({ chatId, limit: String(limit) });
    const result = await this.request<unknown>(`${path}?${query}`);
    return arrayFromPayload(result, ['messages', 'data', 'value', 'items']).map(
      (row, index) => {
        if (!isRecord(row)) {
          throw new Error(`OpenWA message at index ${index} is not an object`);
        }
        return row;
      },
    );
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${this.env.apiUrl}${path}`, {
      headers: { 'X-API-Key': this.env.apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`OpenWA ${response.status}: ${text || response.statusText}`);
    }

    let result: unknown;
    try {
      result = JSON.parse(text);
    } catch {
      throw new Error('OpenWA returned an invalid JSON response');
    }
    if (
      isRecord(result) &&
      'success' in result &&
      result.success === false
    ) {
      const error =
        typeof result.error === 'string' ? result.error : 'request was rejected';
      throw new Error(`OpenWA: ${error}`);
    }
    return result as T;
  }
}

export function extractOpenWaMessageText(
  message: OpenWaMessage,
  chatId: string,
  cutoffMs: number,
): string | null {
  if (message.fromMe === true) return null;
  if (typeof message.chatId === 'string' && message.chatId !== chatId) {
    return null;
  }

  const text =
    typeof message.body === 'string'
      ? message.body
      : typeof message.text === 'string'
        ? message.text
        : '';
  if (!text.trim()) return null;

  const timestamp = message.timestamp ?? message.date ?? message.createdAt;
  const messageTime = timestampMs(timestamp);
  if (messageTime === null || messageTime < cutoffMs) return null;
  return text;
}

function timestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function arrayFromPayload(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) {
    throw new Error('OpenWA response did not contain a list');
  }
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
    if (isRecord(payload[key])) return arrayFromPayload(payload[key], keys);
  }
  throw new Error('OpenWA response did not contain a list');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
