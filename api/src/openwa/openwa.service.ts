import { Injectable, Logger } from '@nestjs/common';
import type { RateMessages } from '../rates/rates.service';
import {
  extractOpenWaMessageText,
  OpenWaClient,
  readOpenWaEnv,
  type OpenWaEnv,
  type OpenWaGroup,
} from './client';

@Injectable()
export class OpenWaService {
  private readonly log = new Logger(OpenWaService.name);
  private readonly env: OpenWaEnv | null;

  constructor() {
    try {
      this.env = readOpenWaEnv();
    } catch (err) {
      this.env = null;
      this.log.error(
        `Configuración OPENWA_SOURCE inválida: ${err instanceof Error ? err.message : err}`,
      );
    }
    if (!this.env) {
      this.log.warn(
        'OpenWA para tasas desactivado; configura OPENWA_API_URL, OPENWA_API_KEY, OPENWA_SESSION_ID y OPENWA_SOURCE',
      );
    }
  }

  async fetchMessages(): Promise<RateMessages | null> {
    if (!this.env) return null;

    const client = new OpenWaClient(this.env);
    try {
      const session = await client.getSession();
      if (session.status !== 'ready') {
        this.log.warn(`OpenWA: sesión ${this.env.sessionId} no lista (${session.status})`);
        return null;
      }

      const groups = await this.resolveGroups(client, this.env.sources);
      if (!groups.length) return null;

      const cutoff = Date.now() - this.env.days * 24 * 60 * 60 * 1000;
      const texts: string[] = [];
      const sources: string[] = [];

      for (const group of groups) {
        try {
          const messages = await client.getMessages(group.id);
          let kept = 0;
          for (const message of messages) {
            const text = extractOpenWaMessageText(message, group.id, cutoff);
            if (!text) continue;
            texts.push(text);
            kept += 1;
          }
          sources.push(group.id);
          this.log.log(
            `${group.name}: ${kept} msgs en últimos ${this.env.days}d (de ${messages.length} leídos)`,
          );
        } catch (err) {
          this.log.warn(
            `OpenWA ${group.name} falló: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      this.log.log(`OpenWA: ${texts.length} mensajes útiles para tasas`);
      return texts.length ? { texts, sources } : null;
    } catch (err) {
      this.log.warn(
        `OpenWA API no disponible: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private async resolveGroups(
    client: OpenWaClient,
    selectors: string[],
  ): Promise<OpenWaGroup[]> {
    const groups = selectors
      .filter((source) => source.includes('@g.us'))
      .map((id) => ({ id, name: id }));
    const names = selectors.filter((source) => !source.includes('@g.us'));

    if (names.length) {
      let available: OpenWaGroup[] = [];
      try {
        available = await client.getGroups();
      } catch (err) {
        this.log.warn(
          `No se pudieron resolver nombres de grupos en OpenWA: ${err instanceof Error ? err.message : err}`,
        );
        if (!groups.length) return [];
      }
      for (const name of names) {
        const matches = available.filter(
          (group) => normalize(group.name) === normalize(name),
        );
        if (matches.length === 1) {
          groups.push(matches[0]);
        } else {
          this.log.warn(
            matches.length
              ? `OpenWA: el nombre "${name}" coincide con varios grupos; usa el JID`
              : `OpenWA: no se encontró el grupo "${name}"`,
          );
        }
      }
    }

    return [...new Map(groups.map((group) => [group.id, group])).values()];
  }
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
}
