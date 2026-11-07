import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { TelegramClient } from 'teleproto';
import { createClient, readTelegramEnv, type TelegramEnv } from './client';
import { parseRatesFromTexts } from './parse-rates';
import { parseSaldoMovilFromTexts } from './parse-saldo';
import type { RatesResponse } from '../rates/rates.service';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(TelegramService.name);
  private client: TelegramClient | null = null;
  private env: TelegramEnv | null = null;
  private ready = false;
  private connecting: Promise<void> = Promise.resolve();

  onModuleInit() {
    this.connecting = this.connect();
    return this.connecting;
  }

  async whenReady() {
    await this.connecting;
    return this.ready;
  }

  isReady() {
    return this.ready;
  }

  private async connect() {
    this.env = readTelegramEnv();
    if (!this.env) {
      this.log.warn(
        'Telegram sin configurar (faltan TELEGRAM_API_ID / HASH / SESSION) → fallback hardcodeado',
      );
      return;
    }

    this.log.log(
      `Conectando sesión Telegram → ${this.env.sources.length} grupo(s), ventana ${this.env.days}d: ${this.env.sources.map((s) => '@' + s).join(', ')}`,
    );

    try {
      this.client = createClient(this.env);
      await this.client.connect();

      if (!(await this.client.isUserAuthorized())) {
        this.log.error(
          'Sesión Telegram NO autorizada. Corre: npm run telegram:login --workspace=api',
        );
        await this.client.disconnect();
        this.client = null;
        return;
      }

      const me = await this.client.getMe();
      const who =
        'username' in me && me.username
          ? `@${me.username}`
          : 'firstName' in me && me.firstName
            ? String(me.firstName)
            : `id:${String(me.id)}`;

      this.ready = true;
      this.log.log(`Sesión Telegram OK — entraste como ${who}`);
    } catch (err) {
      this.log.error(
        `No se pudo entrar a Telegram: ${err instanceof Error ? err.message : err}`,
      );
      this.client = null;
      this.ready = false;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.disconnect();
      this.log.log('Sesión Telegram desconectada');
    }
  }

  async fetchRates(): Promise<RatesResponse | null> {
    if (!this.client || !this.env || !this.ready) return null;

    const cutoff =
      Math.floor(Date.now() / 1000) - this.env.days * 24 * 60 * 60;
    const texts: string[] = [];
    let kept = 0;
    let scanned = 0;

    for (const source of this.env.sources) {
      try {
        // ponytail: 200/grupo; si el grupo publica poco, subir o paginar.
        const messages = await this.client.getMessages(source, { limit: 200 });
        let fromSource = 0;
        for (const m of messages) {
          scanned += 1;
          const date = 'date' in m && typeof m.date === 'number' ? m.date : 0;
          if (date < cutoff) continue;
          const text =
            'message' in m && typeof m.message === 'string' ? m.message : '';
          if (!text) continue;
          texts.push(text);
          fromSource += 1;
          kept += 1;
        }
        this.log.log(
          `@${source}: ${fromSource} msgs en últimos ${this.env.days}d (de ${messages.length} leídos)`,
        );
      } catch (err) {
        this.log.warn(
          `@${source} falló: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    this.log.log(
      `Telegram: ${kept} msgs útiles / ${scanned} escaneados → mediana compra/venta`,
    );

    const rates = parseRatesFromTexts(texts) ?? [];
    const saldoMovil = parseSaldoMovilFromTexts(texts);
    if (!rates.length && !saldoMovil) {
      this.log.warn('Telegram: no se pudieron parsear tasas en la ventana');
      return null;
    }
    if (saldoMovil?.length) {
      this.log.log(
        `Saldo móvil (mediana CUP): ${saldoMovil.map((t) => `${t.amount}→${t.buy}/${t.sell}`).join(' · ')}`,
      );
    }

    return {
      base: 'CUP',
      rates,
      saldoMovil,
      updatedAt: new Date().toISOString(),
      sources: this.env.sources,
      provisional: false,
    };
  }
}
