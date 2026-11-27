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

export interface PickView {
  /** Fichas boca abajo. */
  count: number;
  /** Fichas ya levantadas (estas sí se ven). */
  picks: { index: number; player: number; tile: Tile }[];
  /** Bandos que aún no han levantado. */
  pendingSides: number[];
  /** Jugador que sacó la más alta, cuando ya levantaron todos. */
  winner: number | null;
}

export interface GameView {
  mode: 'teams' | 'individual';
  phase: 'picking' | 'agreeing' | 'playing' | 'roundOver' | 'gameOver';
  pick: PickView | null;
  /** Bando que decide quién sale (fase `agreeing`). */
  startSide: number | null;
  /** Jugador que pidió salir y espera la respuesta de su compañero. */
  startRequest: number | null;
  /** Último que rechazó una petición de salida. */
  startRejectedBy: number | null;
  /** Resultado de cada mano terminada. */
  history: {
    round: number;
    reason: 'domino' | 'tranque';
    winnerSide: number | null;
    winnerPlayer: number | null;
    points: number;
    scores: number[];
  }[];
  round: number;
  turn: number;
  board: PlacedTile[];
  /** Posición en `board` de la ficha de salida. */
  boardOrigin: number;
  boneyardCount: number;
  scores: number[];
  targetScore: number;
  requiredOpening: Tile | null;
  lastResult: RoundResult | null;
  winnerSide: number | null;
  log: LogEntry[];
  /** Entradas totales del registro en esta mano (`log` solo trae las últimas). */
  logTotal: number;
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
