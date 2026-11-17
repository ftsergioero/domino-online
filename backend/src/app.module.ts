import { Controller, Get, Module } from '@nestjs/common';
import { TablesModule } from './tables/tables.module';

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { ok: true };
  }
}

@Module({
  imports: [TablesModule],
  controllers: [HealthController],
})
export class AppModule {}
