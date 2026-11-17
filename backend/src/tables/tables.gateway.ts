import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ScoringRules, Side, Tile } from '../domain';
import { cleanName, isPlayerId } from '../profiles/profile.validation';
import { ProfilesService } from '../profiles/profiles.service';
import { TableRecord } from './table.types';
import { ActionOutcome, GameError, TablesService } from './tables.service';

type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };

interface SocketData {
  playerId: string;
  name: string;
  tableId?: string;
  lastChatAt?: number;
}

const tableRoom = (id: string) => `table:${id}`;
const playerRoom = (id: string) => `player:${id}`;
const normId = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase() : '');

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true },
})
export class TablesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly log = new Logger(TablesGateway.name);
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly tables: TablesService,
    private readonly profiles: ProfilesService,
  ) {}

  // ---------- conexión ----------

  handleConnection(socket: Socket) {
    const { playerId, name } = (socket.handshake.auth ?? {}) as Record<string, unknown>;
    if (!isPlayerId(playerId)) {
      socket.emit('error:fatal', { error: 'playerId inválido' });
      socket.disconnect(true);
      return;
    }
    let clean = 'Jugador';
    try {
      clean = cleanName(name);
    } catch {
      /* nombre por defecto */
    }
    const data = socket.data as SocketData;
    data.playerId = playerId;
    data.name = clean;
    socket.join(playerRoom(playerId));
  }

  async handleDisconnect(socket: Socket) {
    const { playerId, tableId } = socket.data as SocketData;
    if (!tableId) return;
    const others = (await this.server.in(tableRoom(tableId)).fetchSockets()).some(
      (s) => (s.data as SocketData).playerId === playerId,
    );
    if (others) return;
    await this.run(async () => this.broadcastState(await this.tables.setConnected(tableId, playerId, false)));
  }

  // ---------- mesas ----------

  @SubscribeMessage('table:create')
  create(@ConnectedSocket() socket: Socket, @MessageBody() body: { rules?: Partial<ScoringRules>; seat?: number }) {
    return this.run(async () => {
      const table = await this.tables.create(body?.rules);
      return this.doJoin(socket, table.id, body?.seat);
    });
  }

  @SubscribeMessage('table:join')
  join(@ConnectedSocket() socket: Socket, @MessageBody() body: { tableId: string; seat?: number }) {
    return this.run(() => this.doJoin(socket, normId(body?.tableId), body?.seat));
  }

  /** Para reconectar tras recargar: devuelve la mesa en la que está sentado el jugador. */
  @SubscribeMessage('table:resume')
  resume(@ConnectedSocket() socket: Socket) {
    return this.run(async () => {
      const { playerId } = socket.data as SocketData;
      const tableId = await this.tables.findPlayerTable(playerId);
      const table = tableId ? await this.tables.get(tableId) : null;
      if (!table || this.tables.seatOf(table, playerId) === null) return { tableId: null };
      return this.doJoin(socket, table.id);
    });
  }

  @SubscribeMessage('table:leave')
  leave(@ConnectedSocket() socket: Socket) {
    return this.run(async () => {
      const data = socket.data as SocketData;
      if (!data.tableId) return {};
      const id = data.tableId;
      data.tableId = undefined;
      await socket.leave(tableRoom(id));
      this.broadcastState(await this.tables.leave(id, data.playerId));
      return {};
    });
  }

  @SubscribeMessage('table:rematch')
  rematch(@ConnectedSocket() socket: Socket) {
    return this.run(async () => {
      const { tableId, playerId } = this.seated(socket);
      const table = await this.tables.rematch(tableId, playerId);
      this.broadcastState(table);
      this.emitTurn(table);
      return {};
    });
  }

  // ---------- juego ----------

  @SubscribeMessage('game:play')
  play(@ConnectedSocket() socket: Socket, @MessageBody() body: { tile: Tile; side: Side }) {
    return this.run(async () => {
      const { tableId, playerId } = this.seated(socket);
      const tile = body?.tile;
      if (!Array.isArray(tile) || tile.length !== 2 || !tile.every((n) => Number.isInteger(n)))
        throw new GameError('Ficha inválida');
      const out = await this.tables.play(tableId, playerId, [tile[0], tile[1]], body.side);
      await this.afterAction(out);
      return {};
    });
  }

  @SubscribeMessage('game:pass')
  pass(@ConnectedSocket() socket: Socket) {
    return this.run(async () => {
      const { tableId, playerId } = this.seated(socket);
      await this.afterAction(await this.tables.pass(tableId, playerId));
      return {};
    });
  }

  @SubscribeMessage('chat:phrase')
  phrase(@ConnectedSocket() socket: Socket, @MessageBody() body: { text: string; gesture?: string }) {
    return this.run(async () => {
      const data = this.seated(socket);
      const now = Date.now();
      if (data.lastChatAt && now - data.lastChatAt < 1000) throw new GameError('Más despacio');
      (socket.data as SocketData).lastChatAt = now;
      const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 120) : '';
      if (!text) throw new GameError('Frase vacía');
      const gesture = typeof body?.gesture === 'string' ? body.gesture.slice(0, 32) : undefined;
      const table = await this.tables.get(data.tableId);
      const seat = table ? this.tables.seatOf(table, data.playerId) : null;
      this.server.to(tableRoom(data.tableId)).emit('chat:phrase', { seat, name: data.name, text, gesture });
      return {};
    });
  }

  // ---------- internos ----------

  private async doJoin(socket: Socket, tableId: string, seat?: number) {
    const data = socket.data as SocketData;
    if (!tableId) throw new GameError('Falta el código de mesa');
    const profile = await this.profiles.ensure(data.playerId, data.name);
    if (data.tableId && data.tableId !== tableId) {
      await socket.leave(tableRoom(data.tableId));
    }
    const out = await this.tables.join(
      tableId,
      { playerId: data.playerId, name: profile.name, avatar: profile.avatar },
      seat,
    );
    data.tableId = tableId;
    await socket.join(tableRoom(tableId));
    this.broadcastState(out.table);
    if (out.started) this.emitTurn(out.table);
    if (out.table.status === 'hand_over') this.scheduleNextHand(out.table);
    return { tableId, seat: out.seat, rejoined: out.rejoined };
  }

  private async afterAction({ table, actor, result, events }: ActionOutcome) {
    const room = this.server.to(tableRoom(table.id));
    this.broadcastState(table);

    if (result.type === 'continue') this.emitTurn(table);
    else if (result.type === 'pegado') room.emit('game:pegado', { seat: actor, capicua: result.capicua });
    else room.emit('game:tranque', { totals: table.lastHand!.totals });

    if (result.type !== 'continue') {
      const last = table.lastHand!;
      room.emit('hand:score', { ...last.outcome, score: table.match!.score, totals: last.totals, hands: last.hands });
      if (table.status === 'finished') {
        room.emit('match:end', { winnerTeam: table.matchWinner, score: table.match!.score });
        this.profiles
          .recordMatch({
            tableId: table.id,
            players: table.seats.map((s, seat) => ({ seat, playerId: s!.playerId, name: s!.name })),
            score: table.match!.score,
            winnerTeam: table.matchWinner!,
            hands: table.handNumber,
            rules: table.rules,
          })
          .catch((e) => this.log.error(`No se pudo guardar el historial: ${e}`));
      } else {
        this.scheduleNextHand(table);
      }
    }

    for (const ev of events) {
      const seat = table.seats[ev.seat];
      if (!seat) continue;
      const r = await this.profiles.reactionFor(seat.playerId, ev.event).catch(() => undefined);
      if (r) room.emit('reaction', { seat: ev.seat, name: seat.name, event: ev.event, gesture: r.gesture, phrase: r.phrase });
    }
  }

  private scheduleNextHand(table: TableRecord) {
    if (this.timers.has(table.id)) return;
    const delay = Math.max(0, (table.nextHandAt ?? Date.now()) - Date.now());
    const timer = setTimeout(async () => {
      this.timers.delete(table.id);
      try {
        const { table: t, started } = await this.tables.startNextHand(table.id, true);
        if (started) {
          this.broadcastState(t);
          this.emitTurn(t);
        }
      } catch (e) {
        this.log.error(`Error iniciando mano en ${table.id}: ${e}`);
      }
    }, delay);
    this.timers.set(table.id, timer);
  }

  private broadcastState(table: TableRecord) {
    table.seats.forEach((s, seat) => {
      if (s) this.server.to(playerRoom(s.playerId)).emit('game:state', this.tables.view(table, seat));
    });
  }

  private emitTurn(table: TableRecord) {
    if (table.status === 'playing' && table.game)
      this.server.to(tableRoom(table.id)).emit('game:turn', { seat: table.game.turn });
  }

  private seated(socket: Socket) {
    const data = socket.data as SocketData;
    if (!data.tableId) throw new GameError('No estás en ninguna mesa');
    return data as SocketData & { tableId: string };
  }

  private async run<T extends object>(fn: () => Promise<T | void>): Promise<Ack<T>> {
    try {
      return { ok: true, ...((await fn()) ?? ({} as T)) };
    } catch (e) {
      if (e instanceof GameError) return { ok: false, error: e.message };
      this.log.error(e);
      return { ok: false, error: 'Error interno' };
    }
  }
}
