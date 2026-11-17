import {
  GameState,
  HandOutcome,
  Match,
  Move,
  Result,
  ScoringRules,
  Side,
  Tile,
} from '../domain';
import { Avatar } from '../profiles/profile.types';

export type TableStatus = 'waiting' | 'playing' | 'hand_over' | 'finished';

export interface SeatInfo {
  playerId: string; // secreto del cliente: nunca se envía a los demás
  name: string;
  connected: boolean;
  avatar: Avatar;
}

export interface LastHand {
  result: Exclude<Result, { type: 'continue' }>;
  outcome: HandOutcome;
  hands: Tile[][]; // se revelan al terminar la mano
  totals: number[];
}

export interface TableRecord {
  id: string;
  status: TableStatus;
  rules: ScoringRules;
  seats: (SeatInfo | null)[];
  game: GameState | null;
  match: Match | null;
  handNumber: number;
  lastHand: LastHand | null;
  nextHandAt: number | null;
  matchWinner: 0 | 1 | null;
  createdAt: number;
  updatedAt: number;
}

/** Lo que recibe cada jugador en `game:state`: solo su mano y el conteo de las demás. */
export interface TableView {
  id: string;
  status: TableStatus;
  rules: ScoringRules;
  mySeat: number | null;
  seats: ({ name: string; connected: boolean; avatar: Avatar; tiles: number } | null)[];
  hand: Tile[];
  playable: Move[];
  canPass: boolean;
  chain: Tile[];
  ends: [number, number] | null;
  turn: number | null;
  passes: number;
  score: [number, number];
  handNumber: number;
  lastHand: LastHand | null;
  nextHandAt: number | null;
  matchWinner: 0 | 1 | null;
}

export interface PlayPayload {
  tile: Tile;
  side: Side;
}
