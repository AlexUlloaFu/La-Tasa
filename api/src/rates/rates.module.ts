import { Module } from '@nestjs/common';
import { RatesController } from './rates.controller';
import { RatesService } from './rates.service';
import { RatesWorker } from './rates.worker';
import { TelegramService } from '../telegram/telegram.service';
import { OpenWaService } from '../openwa/openwa.service';

@Module({
  controllers: [RatesController],
  providers: [TelegramService, OpenWaService, RatesService, RatesWorker],
})
export class RatesModule {}
