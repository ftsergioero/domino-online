// Tipos del protocolo (espejo de backend/src/tables/table.types.ts).
export type Tile = [number, number];
export type Side = 'left' | 'right';

export interface Avatar {
  body: string;
  face: string;
  hair: string;
  color: string;
}

export interface Rules {
  target: number;
  countAllHands: boolean;
  tranqueByIndividual: boolean;
}

export interface SeatView {
  name: string;
  connected: boolean;
  avatar: Avatar;
  tiles: number;
}

export interface LastHand {
  result: { type: 'pegado'; player: number; capicua: boolean } | { type: 'tranque' };
  outcome: { winnerTeam: 0 | 1 | null; points: number };
  hands: Tile[][];
  totals: number[];
}

export interface TableView {
  id: string;
  status: 'waiting' | 'playing' | 'hand_over' | 'finished';
  rules: Rules;
  mySeat: number | null;
  seats: (SeatView | null)[];
  hand: Tile[];
  playable: { tile: Tile; side: Side }[];
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

export const REACTION_EVENTS = [
  'pegarse',
  'pasar',
  'tranque',
  'capicua',
  'ganar_mano',
  'perder_mano',
  'ganar_partida',
  'perder_partida',
] as const;
export type ReactionEvent = (typeof REACTION_EVENTS)[number];

export interface ReactionConfig {
  event: ReactionEvent;
  gesture: string;
  phrase: string;
}

export interface Profile {
  playerId: string;
  name: string;
  avatar: Avatar;
  reactions: ReactionConfig[];
}

export interface Bubble {
  seat: number;
  text: string;
  gesture?: string;
  id: number;
}

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };
