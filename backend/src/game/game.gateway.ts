import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameError } from './domino';
import { Room, RoomsService } from './rooms.service';

type Ack = { ok: true; [k: string]: unknown } | { ok: false; error: string };

interface SocketData {
  code?: string;
  playerId?: string;
}

const corsOrigin = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true;

@WebSocketGateway({ cors: { origin: corsOrigin, credentials: true } })
export class GameGateway implements OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(GameGateway.name);
  private sweeper = setInterval(() => this.rooms.sweep(), 5 * 60 * 1000);

  constructor(private readonly rooms: RoomsService) {}

  onModuleDestroy() {
    clearInterval(this.sweeper);
  }

  handleDisconnect(client: Socket) {
    const room = this.rooms.disconnect(client.id);
    if (room) this.broadcast(room);
  }

  @SubscribeMessage('room:create')
  create(@ConnectedSocket() client: Socket, @MessageBody() body: { name?: string; targetScore?: number }): Ack {
    return this.run(() => {
      this.leaveCurrent(client);
      const { room, player } = this.rooms.create(body?.name, body?.targetScore, client.id);
      this.attach(client, room, player.id);
      this.logger.log(`Sala ${room.code} creada por ${player.name}`);
      return { code: room.code, playerId: player.id };
    });
  }

  @SubscribeMessage('room:join')
  join(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { code?: string; name?: string; playerId?: string },
  ): Ack {
    return this.run(() => {
      const data = client.data as SocketData;
      if (data.code && data.code !== String(body?.code ?? '').toUpperCase()) this.leaveCurrent(client);
      const { room, player } = this.rooms.join(body?.code, body?.name, body?.playerId, client.id);
      this.attach(client, room, player.id);
      return { code: room.code, playerId: player.id };
    });
  }

  @SubscribeMessage('room:leave')
  leave(@ConnectedSocket() client: Socket): Ack {
    return this.run(() => {
      this.leaveCurrent(client);
      return {};
    });
  }

  @SubscribeMessage('room:move')
  move(@ConnectedSocket() client: Socket, @MessageBody() body: { playerId: string; seat: number }): Ack {
    return this.withRoom(client, (room, me) => this.rooms.movePlayer(room, me, body?.playerId, Number(body?.seat)));
  }

  @SubscribeMessage('game:start')
  start(@ConnectedSocket() client: Socket): Ack {
    return this.withRoom(client, (room, me) => this.rooms.start(room, me));
  }

  @SubscribeMessage('game:play')
  play(@ConnectedSocket() client: Socket, @MessageBody() body: { tileIndex: number; side: string }): Ack {
    return this.withRoom(client, (room, me) => this.rooms.play(room, me, body?.tileIndex, body?.side));
  }

  @SubscribeMessage('game:draw')
  draw(@ConnectedSocket() client: Socket): Ack {
    return this.withRoom(client, (room, me) => this.rooms.draw(room, me));
  }

  @SubscribeMessage('game:pick')
  pick(@ConnectedSocket() client: Socket, @MessageBody() body: { index: number }): Ack {
    return this.withRoom(client, (room, me) => this.rooms.pickStart(room, me, body?.index));
  }

  @SubscribeMessage('game:requestStart')
  requestStart(@ConnectedSocket() client: Socket): Ack {
    return this.withRoom(client, (room, me) => this.rooms.requestStart(room, me));
  }

  @SubscribeMessage('game:respondStart')
  respondStart(@ConnectedSocket() client: Socket, @MessageBody() body: { accept: boolean }): Ack {
    return this.withRoom(client, (room, me) => this.rooms.respondStart(room, me, body?.accept));
  }

  @SubscribeMessage('game:nextRound')
  nextRound(@ConnectedSocket() client: Socket): Ack {
    return this.withRoom(client, (room, me) => this.rooms.nextRound(room, me));
  }

  @SubscribeMessage('game:lobby')
  lobby(@ConnectedSocket() client: Socket): Ack {
    return this.withRoom(client, (room, me) => this.rooms.backToLobby(room, me));
  }

  // --- utilidades ---

  private run(fn: () => Record<string, unknown>): Ack {
    try {
      return { ok: true, ...fn() };
    } catch (e) {
      if (e instanceof GameError) return { ok: false, error: e.message };
      this.logger.error(e);
      return { ok: false, error: 'Error inesperado del servidor' };
    }
  }

  private withRoom(client: Socket, fn: (room: Room, playerId: string) => void): Ack {
    return this.run(() => {
      const data = client.data as SocketData;
      if (!data.code || !data.playerId) throw new GameError('No estás en ninguna sala');
      const room = this.rooms.get(data.code);
      fn(room, data.playerId);
      this.broadcast(room);
      return {};
    });
  }

  private attach(client: Socket, room: Room, playerId: string) {
    client.data = { code: room.code, playerId } satisfies SocketData;
    client.join(room.code);
    this.broadcast(room);
  }

  private leaveCurrent(client: Socket) {
    const data = client.data as SocketData;
    if (!data?.code || !data.playerId) return;
    client.leave(data.code);
    try {
      const room = this.rooms.get(data.code);
      this.rooms.leave(room, data.playerId);
      this.broadcast(room);
    } catch {
      /* la sala ya no existe */
    }
    client.data = {};
  }

  private broadcast(room: Room) {
    for (const p of room.players) {
      if (p.socketId) this.server.to(p.socketId).emit('room:state', this.rooms.viewFor(room, p.id));
    }
  }
}
