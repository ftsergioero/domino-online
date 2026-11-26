export type Tile = [number, number];
export type Side = 'left' | 'right';

export interface PlacedTile {
  a: number;
  b: number;
}

export interface RoundResult {
  reason: 'domino' | 'tranque';
  winnerSide: number | null;
  winnerPlayer: number | null;
  points: number;
  handPoints: number[];
  hands: Tile[][];
}

export interface LogEntry {
  player: number;
  action: 'play' | 'draw' | 'pass';
  tile?: Tile;
  side?: Side;
}

export interface SeatView {
  id: string;
  name: string;
  side: number;
  tiles: number;
}

export interface GameView {
  mode: 'teams' | 'individual';
  phase: 'playing' | 'roundOver' | 'gameOver';
  round: number;
  turn: number;
  board: PlacedTile[];
  boneyardCount: number;
  scores: number[];
  targetScore: number;
  requiredOpening: Tile | null;
  lastResult: RoundResult | null;
  winnerSide: number | null;
  log: LogEntry[];
  seat: number;
  hand: Tile[];
  moves: { tileIndex: number; sides: Side[] }[];
  canDraw: boolean;
  seats: SeatView[];
}

export interface RoomView {
  code: string;
  hostId: string;
  targetScore: number;
  you: string;
  players: { id: string; name: string; connected: boolean }[];
  game: GameView | null;
}

export type Ack = { ok: true; code?: string; playerId?: string } | { ok: false; error: string };
