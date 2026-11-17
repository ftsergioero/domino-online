import { Logger, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { ProfilesModule } from '../profiles/profiles.module';
import { MemoryTablesRepository, RedisTablesRepository, TablesRepository } from './tables.repository';
import { TablesGateway } from './tables.gateway';
import { TablesService } from './tables.service';

@Module({
  imports: [ProfilesModule.register()],
  providers: [
    TablesService,
    TablesGateway,
    {
      provide: TablesRepository,
      useFactory: () => {
        const url = process.env.REDIS_URL;
        new Logger('TablesModule').log(url ? `Redis en ${url}` : 'Mesas en memoria (sin REDIS_URL)');
        return url ? new RedisTablesRepository(new Redis(url)) : new MemoryTablesRepository();
      },
    },
  ],
})
export class TablesModule {}
