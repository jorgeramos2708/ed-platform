import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('api')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('health')
  check() {
    return this.health.check();
  }
}
