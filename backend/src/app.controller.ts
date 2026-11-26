import { Controller, Get } from '@nestjs/common';
import { RoomsService } from './game/rooms.service';

@Controller()
export class AppController {
  constructor(private readonly rooms: RoomsService) {}

  @Get('health')
  health() {
    return { status: 'ok', rooms: this.rooms.size };
  }
}
