import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Put } from '@nestjs/common';
import { REACTION_EVENTS } from '../domain';
import { isPlayerId } from './profile.validation';
import { ProfilesService } from './profiles.service';

// Nota: sin autenticación todavía; el playerId actúa como credencial del cliente.
@Controller()
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('reactions/events')
  events() {
    return REACTION_EVENTS;
  }

  @Get('profiles/:playerId')
  async get(@Param('playerId') playerId: string) {
    this.check(playerId);
    const p = await this.profiles.get(playerId);
    if (!p) throw new NotFoundException('Perfil no encontrado');
    return p;
  }

  @Put('profiles/:playerId')
  async update(@Param('playerId') playerId: string, @Body() body: Record<string, unknown>) {
    this.check(playerId);
    try {
      return await this.profiles.update(playerId, body ?? {});
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('profiles/:playerId/history')
  history(@Param('playerId') playerId: string) {
    this.check(playerId);
    return this.profiles.history(playerId);
  }

  private check(playerId: string) {
    if (!isPlayerId(playerId)) throw new BadRequestException('playerId inválido');
  }
}
