import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TelegramService } from '../telegram/telegram.service';
import { toSnapshot, withChange } from './change';
import { loadSnapshot, saveSnapshot } from './snapshot-store';

export type PriceChange = {
  buy: number;
  sell: number;
};

export type CurrencyPair = {
  currency: 'USD' | 'ZELLE' | 'USDT' | 'EUR' | 'MLC';
  buy: number;
  sell: number;
  change?: PriceChange | null;
};

export type SaldoTier = {
  amount: 120 | 240 | 360;
  buy: number;
  sell: number;
  change?: PriceChange | null;
};

export type RatesResponse = {
  base: 'CUP';
  rates: CurrencyPair[];
  saldoMovil: SaldoTier[] | null;
  updatedAt: string;
  sources: string[];
  provisional: boolean;
};

const FALLBACK: RatesResponse = {
  base: 'CUP',
  rates: [
    { currency: 'USD', buy: 925, sell: 940 },
    { currency: 'ZELLE', buy: 910, sell: 925 },
    { currency: 'USDT', buy: 920, sell: 935 },
    { currency: 'EUR', buy: 1005, sell: 1025 },
    { currency: 'MLC', buy: 645, sell: 665 },
  ],
  saldoMovil: [
    { amount: 120, buy: 145, sell: 155 },
    { amount: 240, buy: 290, sell: 310 },
    { amount: 360, buy: 430, sell: 460 },
  ],
  updatedAt: '2026-11-07T12:00:00-05:00',
  sources: [
    'RiC_Red_de_intercambio_CUBA',
    'usdthabanaventaycompra',
    'USD_Holguin',
    'Cuba_Compra_Venta',
  ],
  provisional: true,
};

@Injectable()
export class RatesService implements OnModuleInit {
  private readonly log = new Logger(RatesService.name);
  // ponytail: cache proceso 5min; Redis/job si hay varias instancias.
  private cache: { at: number; data: RatesResponse } | null = null;
  private readonly ttlMs = 5 * 60 * 1000;

  constructor(private readonly telegram: TelegramService) {}

  async onModuleInit() {
    await this.telegram.whenReady();
    this.log.log('Chequeo de precios al arranque…');
    const data = await this.refreshFromTelegram();
    this.logRates('arranque', data);
  }

  async getRates(): Promise<RatesResponse> {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) {
      return this.cache.data;
    }
    return this.refreshFromTelegram();
  }

  /** Fuerza escaneo (arranque / worker), ignora TTL del cache. */
  async scanNow(label = 'manual'): Promise<RatesResponse> {
    await this.telegram.whenReady();
    const data = await this.refreshFromTelegram();
    this.logRates(label, data);
    return data;
  }

  private async refreshFromTelegram(): Promise<RatesResponse> {
    let raw: RatesResponse = FALLBACK;

    if (!this.telegram.isReady()) {
      this.log.warn('Telegram no listo → usando tasas provisionales');
    } else {
      try {
        const live = await this.telegram.fetchRates();
        if (live) raw = live;
        else this.log.warn('Sin tasas parseables → fallback');
      } catch (err) {
        this.log.warn(
          `Fallo al chequear precios: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    const previous = await loadSnapshot();
    const data = withChange(raw, previous);
    // Guardar precios crudos (sin change) para la próxima pasada.
    await saveSnapshot(toSnapshot(raw));
    this.cache = { at: Date.now(), data };
    return data;
  }

  private logRates(when: string, data: RatesResponse) {
    const line = data.rates
      .map((r) => {
        const c = fmtChange(r.change?.buy) + '/' + fmtChange(r.change?.sell);
        return `${r.currency} ${r.buy}/${r.sell}${r.change ? ` (${c})` : ''}`;
      })
      .join(' · ');
    const saldo = data.saldoMovil?.length
      ? ` · Saldo ${data.saldoMovil.map((t) => `${t.amount}:${t.buy}/${t.sell}`).join(' ')}`
      : '';
    this.log.log(
      `Precios (${when})${data.provisional ? ' [provisional]' : ''}: ${line}${saldo}`,
    );
  }
}

function fmtChange(n: number | undefined) {
  if (n == null || n === 0) return '=';
  return n > 0 ? `+${n}` : `${n}`;
}
