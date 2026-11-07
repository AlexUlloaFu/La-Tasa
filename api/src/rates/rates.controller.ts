import { Controller, Get } from '@nestjs/common';
import { RatesService } from './rates.service';

@Controller('rates')
export class RatesController {
  constructor(private readonly rates: RatesService) {}

  @Get()
  getRates() {
    return this.rates.getRates();
  }
}
