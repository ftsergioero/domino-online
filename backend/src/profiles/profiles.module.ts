import { DynamicModule, Logger, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { MODELS } from './profile.models';
import { ProfilesController } from './profiles.controller';
import {
  MemoryProfilesRepository,
  ProfilesRepository,
  SequelizeProfilesRepository,
} from './profiles.repository';
import { ProfilesService } from './profiles.service';

@Module({})
export class ProfilesModule {
  /** MySQL (Sequelize) si hay DB_HOST; si no, perfiles en memoria. */
  static register(): DynamicModule {
    const useMysql = !!process.env.DB_HOST;
    new Logger('ProfilesModule').log(useMysql ? `MySQL en ${process.env.DB_HOST}` : 'Perfiles en memoria (sin DB_HOST)');
    return {
      module: ProfilesModule,
      imports: useMysql
        ? [
            SequelizeModule.forRoot({
              dialect: 'mysql',
              host: process.env.DB_HOST,
              port: Number(process.env.DB_PORT ?? 3306),
              username: process.env.DB_USER,
              password: process.env.DB_PASSWORD,
              database: process.env.DB_NAME,
              models: MODELS,
              synchronize: true,
              autoLoadModels: true,
              logging: false,
            }),
          ]
        : [],
      controllers: [ProfilesController],
      providers: [
        ProfilesService,
        useMysql
          ? {
              provide: ProfilesRepository,
              useFactory: (sequelize: Sequelize) => new SequelizeProfilesRepository(sequelize),
              inject: [Sequelize],
            }
          : { provide: ProfilesRepository, useClass: MemoryProfilesRepository },
      ],
      exports: [ProfilesService],
    };
  }
}
