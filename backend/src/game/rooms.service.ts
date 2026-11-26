import { Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import {
  GameError,
  GameState,
  Side,
  createGame,
  drawTile,
  legalMoves,
  nextRound,
  playTile,
  sideOf,
  winningSide,
} from './domino';

export interface RoomPlayer {
  id: string;
  name: string;
  socketId: string | null;
}

export interface Room {
  code: string;
  hostId: string;
  players: RoomPlayer[];
  targetScore: number;
  game: GameState | null;
  lastActivity: number;
}

const MAX_PLAYERS = 4;
const ROOM_TTL_MS = 60 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class RoomsService {
  private rooms = new Map<string, Room>();

  private newCode(): string {
    for (;;) {
      const bytes = randomBytes(4);
      const code = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
      if (!this.rooms.has(code)) return code;
    }
  }

  private cleanName(name: unknown): string {
    const n = typeof name === 'string' ? name.trim().slice(0, 20) : '';
    if (!n) throw new GameError('Escribe tu nombre');
    return n;
  }

  get(code: string): Room {
    const room = this.rooms.get(String(code ?? '').trim().toUpperCase());
    if (!room) throw new GameError('La sala no existe');
    return room;
  }

  create(name: unknown, targetScore: unknown, socketId: string) {
    const target = [50, 100, 150, 200].includes(Number(targetScore)) ? Number(targetScore) : 100;
    const player: RoomPlayer = { id: randomUUID(), name: this.cleanName(name), socketId };
    const room: Room = {
      code: this.newCode(),
      hostId: player.id,
      players: [player],
      targetScore: target,
      game: null,
      lastActivity: Date.now(),
    };
    this.rooms.set(room.code, room);
    return { room, player };
  }

  join(code: unknown, name: unknown, playerId: unknown, socketId: string) {
    const room = this.get(String(code));
    room.lastActivity = Date.now();
    const existing = typeof playerId === 'string' ? room.players.find((p) => p.id === playerId) : undefined;
    if (existing) {
      // Reconexión de un jugador que ya estaba en la sala.
      existing.socketId = socketId;
      if (typeof name === 'string' && name.trim() && !room.game) existing.name = this.cleanName(name);
      return { room, player: existing };
    }
    if (room.game) throw new GameError('La partida ya empezó');
    if (room.players.length >= MAX_PLAYERS) throw new GameError('La sala está llena');
    const player: RoomPlayer = { id: randomUUID(), name: this.cleanName(name), socketId };
    room.players.push(player);
    return { room, player };
  }

  leave(room: Room, playerId: string) {
    if (room.game) {
      // Durante una partida no se puede eliminar a nadie: solo queda desconectado.
      const p = room.players.find((x) => x.id === playerId);
      if (p) p.socketId = null;
    } else {
      room.players = room.players.filter((p) => p.id !== playerId);
      if (room.hostId === playerId && room.players.length) room.hostId = room.players[0].id;
    }
    if (room.players.length === 0) this.rooms.delete(room.code);
  }

  /** Marca como desconectado el socket. Devuelve la sala afectada, si la hay. */
  disconnect(socketId: string): Room | null {
    for (const room of this.rooms.values()) {
      const p = room.players.find((x) => x.socketId === socketId);
      if (p) {
        p.socketId = null;
        room.lastActivity = Date.now();
        return room;
      }
    }
    return null;
  }

  /** El anfitrión puede reordenar los asientos (para elegir parejas) antes de empezar. */
  movePlayer(room: Room, by: string, playerId: string, toSeat: number) {
    if (room.hostId !== by) throw new GameError('Solo el anfitrión puede cambiar los puestos');
    if (room.game) throw new GameError('La partida ya empezó');
    const from = room.players.findIndex((p) => p.id === playerId);
    if (from < 0 || toSeat < 0 || toSeat >= room.players.length) throw new GameError('Puesto no válido');
    const [p] = room.players.splice(from, 1);
    room.players.splice(toSeat, 0, p);
  }

  start(room: Room, by: string) {
    if (room.hostId !== by) throw new GameError('Solo el anfitrión puede empezar');
    if (room.game && room.game.phase !== 'gameOver') throw new GameError('La partida ya está en curso');
    if (room.players.length < 2) throw new GameError('Se necesitan al menos 2 jugadores');
    room.game = createGame(room.players, room.targetScore);
    room.lastActivity = Date.now();
  }

  private seat(room: Room, playerId: string): number {
    if (!room.game) throw new GameError('La partida no ha empezado');
    const i = room.game.players.findIndex((p) => p.id === playerId);
    if (i < 0) throw new GameError('No estás en esta partida');
    return i;
  }

  play(room: Room, playerId: string, tileIndex: unknown, side: unknown) {
    const s: Side = side === 'left' ? 'left' : 'right';
    playTile(room.game!, this.seat(room, playerId), Number(tileIndex), s);
    room.lastActivity = Date.now();
  }

  draw(room: Room, playerId: string) {
    drawTile(room.game!, this.seat(room, playerId));
    room.lastActivity = Date.now();
  }

  nextRound(room: Room, playerId: string) {
    this.seat(room, playerId);
    nextRound(room.game!);
    room.lastActivity = Date.now();
  }

  /** Vuelve a la sala de espera (tras terminar la partida). */
  backToLobby(room: Room, by: string) {
    if (room.hostId !== by) throw new GameError('Solo el anfitrión puede hacer esto');
    if (room.game && room.game.phase !== 'gameOver') throw new GameError('La partida está en curso');
    room.game = null;
  }

  /** Estado visible para un jugador concreto (oculta las fichas de los demás). */
  viewFor(room: Room, playerId: string) {
    const g = room.game;
    const base = {
      code: room.code,
      hostId: room.hostId,
      targetScore: room.targetScore,
      you: playerId,
      players: room.players.map((p) => ({ id: p.id, name: p.name, connected: p.socketId !== null })),
    };
    if (!g) return { ...base, game: null };
    const seat = g.players.findIndex((p) => p.id === playerId);
    const showHands = g.phase !== 'playing';
    return {
      ...base,
      game: {
        mode: g.mode,
        phase: g.phase,
        round: g.round,
        turn: g.turn,
        board: g.board,
        boneyardCount: g.boneyard.length,
        scores: g.scores,
        targetScore: g.targetScore,
        requiredOpening: g.requiredOpening,
        lastResult: showHands ? g.lastResult : null,
        winnerSide: winningSide(g),
        log: g.log.slice(-8),
        seat,
        hand: seat >= 0 ? g.players[seat].hand : [],
        moves: seat >= 0 && g.turn === seat ? legalMoves(g, seat) : [],
        canDraw:
          seat >= 0 && g.phase === 'playing' && g.turn === seat && legalMoves(g, seat).length === 0 && g.boneyard.length > 0,
        seats: g.players.map((p, i) => ({
          id: p.id,
          name: p.name,
          side: sideOf(g, i),
          tiles: p.hand.length,
        })),
      },
    };
  }

  /** Elimina salas inactivas sin nadie conectado. */
  sweep(now = Date.now()) {
    for (const [code, room] of this.rooms) {
      const anyone = room.players.some((p) => p.socketId !== null);
      if (!anyone && now - room.lastActivity > ROOM_TTL_MS) this.rooms.delete(code);
    }
  }

  get size() {
    return this.rooms.size;
  }
}
