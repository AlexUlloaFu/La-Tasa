import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { RatesService } from './rates.service';
import { SCAN_HOURS, TZ, formatHavana, nextScanAt } from './schedule';

@Injectable()
export class RatesWorker implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(RatesWorker.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private readonly rates: RatesService) {}

  onModuleInit() {
    this.log.log(
      `Worker activo — escaneos ${SCAN_HOURS.map((h) => `${String(h).padStart(2, '0')}:00`).join(', ')} (${TZ})`,
    );
    this.arm();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private arm() {
    if (this.stopped) return;
    const next = nextScanAt();
    const wait = Math.max(1000, next.getTime() - Date.now());
    this.log.log(`Próximo escaneo: ${formatHavana(next)} (en ${Math.round(wait / 60000)} min)`);

    this.timer = setTimeout(async () => {
      try {
        this.log.log('Worker: disparando escaneo programado…');
        await this.rates.scanNow('worker');
      } catch (err) {
        this.log.error(
          `Worker: escaneo falló: ${err instanceof Error ? err.message : err}`,
        );
      } finally {
        this.arm();
      }
    }, wait);
  }
}
