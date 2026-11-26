import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { GameGateway } from './game/game.gateway';
import { RoomsService } from './game/rooms.service';

@Module({
  controllers: [AppController],
  providers: [RoomsService, GameGateway],
})
export class AppModule {}
