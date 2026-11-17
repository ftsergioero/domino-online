import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import {
  DEFAULT_RULES,
  Result,
  ScoringRules,
  Side,
  Tile,
  TriggeredEvent,
  applyHand,
  detectEvents,
  hasPlay,
  legalMoves,
  newGame,
  newMatch,
  pass,
  pips,
  play,
  scoreHand,
} from '../domain';
import { Avatar } from '../profiles/profile.types';
import { TableRecord, TableView } from './table.types';
import { TablesRepository } from './tables.repository';

export class GameError extends Error {}

export interface ActionOutcome {
  table: TableRecord;
  actor: number;
  result: Result;
  events: TriggeredEvent[];
}

export interface JoinOutcome {
  table: TableRecord;
  seat: number;
  rejoined: boolean;
  started: boolean;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class TablesService {
  readonly handPauseMs = Number(process.env.HAND_PAUSE_MS ?? 4000);
  private locks = new Map<string, Promise<unknown>>();

  constructor(private readonly repo: TablesRepository) {}

  /**
   * Serializa las operaciones sobre una misma mesa (lectura-modificación-escritura).
   * Con varias instancias del servidor habría que usar un lock distribuido en Redis.
   */
  private withTable<T>(id: string, fn: (t: TableRecord) => T | Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const run = prev.then(async () => {
      const table = await this.repo.get(id);
      if (!table) throw new GameError('La mesa no existe');
      const out = await fn(table);
      table.updatedAt = Date.now();
      await this.repo.save(table);
      return out;
    });
    const tail = run.catch(() => undefined);
    this.locks.set(id, tail);
    tail.then(() => {
      if (this.locks.get(id) === tail) this.locks.delete(id);
    });
    return run;
  }

  get(id: string) {
    return this.repo.get(id);
  }

  async create(rules?: Partial<ScoringRules>): Promise<TableRecord> {
    const r = { ...DEFAULT_RULES, ...cleanRules(rules) };
    let id: string;
    do {
      id = Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    } while (await this.repo.get(id));
    const now = Date.now();
    const table: TableRecord = {
      id,
      status: 'waiting',
      rules: r,
      seats: [null, null, null, null],
      game: null,
      match: null,
      handNumber: 0,
      lastHand: null,
      nextHandAt: null,
      matchWinner: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.save(table);
    return table;
  }

  /** Sienta al jugador (o lo reconecta a su asiento). Con 4 jugadores empieza la partida. */
  join(
    id: string,
    player: { playerId: string; name: string; avatar: Avatar },
    wantedSeat?: number,
  ): Promise<JoinOutcome> {
    return this.withTable(id, async (t) => {
      const current = t.seats.findIndex((s) => s?.playerId === player.playerId);
      if (current >= 0) {
        const seat = t.seats[current]!;
        Object.assign(seat, { name: player.name, avatar: player.avatar, connected: true });
        await this.repo.setPlayerTable(player.playerId, t.id);
        return { table: t, seat: current, rejoined: true, started: false };
      }
      if (t.status !== 'waiting') throw new GameError('La partida ya empezó');
      let seat: number;
      if (wantedSeat !== undefined && wantedSeat !== null) {
        if (!Number.isInteger(wantedSeat) || wantedSeat < 0 || wantedSeat > 3) throw new GameError('Asiento inválido');
        if (t.seats[wantedSeat]) throw new GameError('Ese asiento está ocupado');
        seat = wantedSeat;
      } else {
        seat = t.seats.findIndex((s) => s === null);
        if (seat < 0) throw new GameError('La mesa está llena');
      }
      t.seats[seat] = { ...player, connected: true };
      await this.repo.setPlayerTable(player.playerId, t.id);
      const started = t.seats.every(Boolean);
      if (started) this.startMatch(t);
      return { table: t, seat, rejoined: false, started };
    });
  }

  /** Antes de empezar libera el asiento; con la partida en curso solo lo marca desconectado. */
  leave(id: string, playerId: string) {
    return this.withTable(id, async (t) => {
      const seat = t.seats.findIndex((s) => s?.playerId === playerId);
      if (seat < 0) return t;
      if (t.status === 'waiting') {
        t.seats[seat] = null;
        await this.repo.setPlayerTable(playerId, null);
      } else {
        t.seats[seat]!.connected = false;
      }
      return t;
    });
  }

  setConnected(id: string, playerId: string, connected: boolean) {
    return this.withTable(id, (t) => {
      const seat = t.seats.find((s) => s?.playerId === playerId);
      if (seat) seat.connected = connected;
      return t;
    });
  }

  findPlayerTable(playerId: string) {
    return this.repo.getPlayerTable(playerId);
  }

  play(id: string, playerId: string, tile: Tile, side: Side): Promise<ActionOutcome> {
    return this.withTable(id, (t) => {
      const seat = this.activeSeat(t, playerId);
      const result = guard(() => play(t.game!, seat, tile, side));
      return this.afterAction(t, seat, 'play', result);
    });
  }

  pass(id: string, playerId: string): Promise<ActionOutcome> {
    return this.withTable(id, (t) => {
      const seat = this.activeSeat(t, playerId);
      const result = guard(() => pass(t.game!, seat));
      return this.afterAction(t, seat, 'pass', result);
    });
  }

  /** Reparte la siguiente mano si terminó la pausa. Idempotente. */
  startNextHand(id: string, force = false) {
    return this.withTable(id, (t) => {
      if (t.status !== 'hand_over') return { table: t, started: false };
      if (!force && t.nextHandAt && Date.now() < t.nextHandAt) return { table: t, started: false };
      this.dealHand(t);
      return { table: t, started: true };
    });
  }

  /** Revancha con los mismos jugadores y reglas. */
  rematch(id: string, playerId: string) {
    return this.withTable(id, (t) => {
      if (!t.seats.some((s) => s?.playerId === playerId)) throw new GameError('No estás en esta mesa');
      if (t.status !== 'finished') throw new GameError('La partida no ha terminado');
      this.startMatch(t);
      return t;
    });
  }

  seatOf(t: TableRecord, playerId: string) {
    const i = t.seats.findIndex((s) => s?.playerId === playerId);
    return i >= 0 ? i : null;
  }

  /** Vista personalizada: la mano propia y solo el número de fichas de los demás. */
  view(t: TableRecord, seat: number | null): TableView {
    const g = t.game;
    const inHand = t.status === 'playing' && !!g;
    const mine = seat !== null && g ? g.hands[seat] : [];
    const myTurn = inHand && seat !== null && g!.turn === seat;
    return {
      id: t.id,
      status: t.status,
      rules: t.rules,
      mySeat: seat,
      seats: t.seats.map((s, i) =>
        s ? { name: s.name, connected: s.connected, avatar: s.avatar, tiles: g ? g.hands[i].length : 0 } : null,
      ),
      hand: mine.map((x) => [x[0], x[1]] as Tile),
      playable: myTurn ? legalMoves(g!, seat!) : [],
      canPass: myTurn && !hasPlay(g!, seat!),
      chain: g?.chain ?? [],
      ends: g?.ends ?? null,
      turn: inHand ? g!.turn : null,
      passes: g?.passes ?? 0,
      score: t.match?.score ?? [0, 0],
      handNumber: t.handNumber,
      lastHand: t.lastHand,
      nextHandAt: t.nextHandAt,
      matchWinner: t.matchWinner,
    };
  }

  // ---------- internos ----------

  private activeSeat(t: TableRecord, playerId: string) {
    const seat = this.seatOf(t, playerId);
    if (seat === null) throw new GameError('No estás sentado en esta mesa');
    if (t.status !== 'playing' || !t.game) throw new GameError('No hay una mano en juego');
    return seat;
  }

  private startMatch(t: TableRecord) {
    t.match = newMatch(t.rules, randomInt(4));
    t.matchWinner = null;
    t.handNumber = 0;
    this.dealHand(t);
  }

  private dealHand(t: TableRecord) {
    t.game = newGame(t.match!.nextStarter);
    t.handNumber++;
    t.status = 'playing';
    t.lastHand = null;
    t.nextHandAt = null;
  }

  private afterAction(t: TableRecord, actor: number, action: 'play' | 'pass', result: Result): ActionOutcome {
    const g = t.game!;
    if (result.type === 'continue') {
      return { table: t, actor, result, events: detectEvents({ action, actor, result, lastMover: g.lastMover }) };
    }
    const outcome = scoreHand(g, result, t.rules);
    const { matchWinner } = applyHand(t.match!, outcome);
    t.lastHand = {
      result,
      outcome,
      hands: g.hands.map((h) => h.map((x) => [x[0], x[1]] as Tile)),
      totals: g.hands.map(pips),
    };
    t.matchWinner = matchWinner;
    if (matchWinner !== null) {
      t.status = 'finished';
      t.nextHandAt = null;
    } else {
      t.status = 'hand_over';
      t.nextHandAt = Date.now() + this.handPauseMs;
    }
    const events = detectEvents({ action, actor, result, lastMover: g.lastMover, outcome, matchWinner });
    return { table: t, actor, result, events };
  }
}

function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    throw new GameError((e as Error).message);
  }
}

function cleanRules(r?: Partial<ScoringRules>): Partial<ScoringRules> {
  if (!r || typeof r !== 'object') return {};
  const out: Partial<ScoringRules> = {};
  if (r.target !== undefined) {
    if (!Number.isInteger(r.target) || r.target < 10 || r.target > 500) throw new GameError('Meta inválida');
    out.target = r.target;
  }
  if (typeof r.countAllHands === 'boolean') out.countAllHands = r.countAllHands;
  if (typeof r.tranqueByIndividual === 'boolean') out.tranqueByIndividual = r.tranqueByIndividual;
  return out;
}
