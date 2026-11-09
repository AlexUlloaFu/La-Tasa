import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TelegramService } from '../telegram/telegram.service';
import { OpenWaService } from '../openwa/openwa.service';
import { mergeRateLists, parseRatesFromTexts } from '../telegram/parse-rates';
import { parseRatesWithLlm } from '../telegram/parse-rates-llm';
import { parseSaldoMovilFromTexts } from '../telegram/parse-saldo';
import { mergeRates, toSnapshot, withChange } from './change';
import { loadSnapshot, saveSnapshot } from './snapshot-store';

export type RateMessages = {
  texts: string[];
  sources: string[];
};

export type PriceChange = {
  buy: number;
  sell: number;
};

export type CurrencyPair = {
  currency: 'USD' | 'ZELLE' | 'USDT' | 'BINANCE' | 'EUR' | 'MLC';
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
    { currency: 'EUR', buy: 1005, sell: 1025 },
    { currency: 'ZELLE', buy: 910, sell: 925 },
    { currency: 'MLC', buy: 645, sell: 665 },
    { currency: 'BINANCE', buy: 915, sell: 930 },
    { currency: 'USDT', buy: 920, sell: 935 },
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
  // ponytail: cache hasta el próximo scan (0/12/18 Havana); no refrescar por request.
  private cache: RatesResponse | null = null;

  constructor(
    private readonly telegram: TelegramService,
    private readonly openwa: OpenWaService,
  ) {}

  async onModuleInit() {
    await this.telegram.whenReady();
    this.log.log('Chequeo de precios al arranque…');
    const data = await this.refreshFromSources();
    this.logRates('arranque', data);
  }

  /** Sirve cache; Telegram/OpenWA solo en arranque + worker 00/12/18 Havana. */
  async getRates(): Promise<RatesResponse> {
    if (this.cache) return this.cache;
    await this.telegram.whenReady();
    if (this.cache) return this.cache;
    return this.refreshFromSources();
  }

  /** Escaneo forzado (arranque / worker 3×/día). */
  async scanNow(label = 'manual'): Promise<RatesResponse> {
    await this.telegram.whenReady();
    const data = await this.refreshFromSources();
    this.logRates(label, data);
    return data;
  }

  private async refreshFromSources(): Promise<RatesResponse> {
    let raw: RatesResponse = FALLBACK;

    const [telegramBatch, openWaBatch] = await Promise.all([
      this.telegram.fetchMessages().catch((err: unknown) => {
        this.log.warn(
          `Telegram falló: ${err instanceof Error ? err.message : err}`,
        );
        return null;
      }),
      this.openwa.fetchMessages().catch((err: unknown) => {
        this.log.warn(
          `OpenWA falló: ${err instanceof Error ? err.message : err}`,
        );
        return null;
      }),
    ]);
    const batches = [telegramBatch, openWaBatch].filter(
      (batch): batch is RateMessages => batch !== null,
    );
    const texts = batches.flatMap((batch) => batch.texts);

    if (!texts.length) {
      this.log.warn(
        'Sin mensajes recientes de Telegram/OpenWA → usando tasas provisionales',
      );
    } else {
      const regexRates = parseRatesFromTexts(texts);
      let llmRates = null as ReturnType<typeof parseRatesFromTexts>;
      if (process.env.GROQ_API_KEY?.trim()) {
        try {
          llmRates = await parseRatesWithLlm(texts);
          this.log.log(
            llmRates?.length
              ? `Groq LLM: ${llmRates.map((r) => `${r.currency} ${r.buy}/${r.sell}`).join(' · ')}`
              : 'Groq LLM: sin tasas',
          );
        } catch (err) {
          this.log.warn(
            `Groq LLM falló → solo regex: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
      const rates = mergeRateLists(llmRates, regexRates) ?? [];
      const saldoMovil = parseSaldoMovilFromTexts(texts);

      if (rates.length || saldoMovil) {
        raw = {
          base: 'CUP',
          rates,
          saldoMovil,
          updatedAt: new Date().toISOString(),
          sources: [...new Set(batches.flatMap((batch) => batch.sources))],
          provisional: false,
        };
        if (saldoMovil?.length) {
          this.log.log(
            `Saldo móvil (mediana CUP): ${saldoMovil.map((t) => `${t.amount}→${t.buy}/${t.sell}`).join(' · ')}`,
          );
        }
      } else {
        this.log.warn('Sin tasas parseables → usando tasas provisionales');
      }
    }

    const previous = await loadSnapshot();
    // live manda; previous solo para Δ (no resucitar BINANCE/USDT inflados viejos)
    const merged: RatesResponse = {
      ...raw,
      rates: mergeRates(raw.rates, previous),
    };
    const data = withChange(merged, previous);
    // Guardar precios crudos (sin change) para la próxima pasada.
    await saveSnapshot(toSnapshot(merged));
    this.cache = data;
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
