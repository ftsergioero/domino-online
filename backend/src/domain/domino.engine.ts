/**
 * Motor del dominó cubano (doble nueve, 4 jugadores en parejas 0-2 / 1-3).
 * Módulo puro: sin dependencias de Nest, Redis ni Socket.IO.
 */
export type Tile = [number, number];
export type Side = 'left' | 'right';

export const PLAYERS = 4;
export const TILES_PER_HAND = 10;
export const MAX_PIP = 9;

export interface GameState {
  hands: Tile[][]; // 4 jugadores, 10 fichas cada uno
  pool: Tile[]; // las 15 que sobran (fuera de juego)
  /**
   * Cadena en mesa, de izquierda a derecha. Cada ficha se guarda orientada:
   * chain[i][1] === chain[i + 1][0], chain[0][0] === ends[0] y
   * chain[n - 1][1] === ends[1].
   */
  chain: Tile[];
  ends: [number, number] | null;
  turn: number; // 0..3; parejas: 0-2 y 1-3
  passes: number; // pases seguidos
  lastMover: number | null; // último jugador que colocó ficha
}

export type Result =
  | { type: 'continue' }
  | { type: 'pegado'; player: number; capicua: boolean }
  | { type: 'tranque' };

export interface Move {
  tile: Tile;
  side: Side;
}

export function createTiles(): Tile[] {
  const tiles: Tile[] = [];
  for (let a = 0; a <= MAX_PIP; a++) for (let b = a; b <= MAX_PIP; b++) tiles.push([a, b]);
  return tiles; // 55
}

export function shuffle<T>(arr: T[], random: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newGame(starter = 0, random: () => number = Math.random): GameState {
  assertPlayer(starter);
  const deck = shuffle(createTiles(), random);
  return {
    hands: [0, 1, 2, 3].map((i) => deck.slice(i * TILES_PER_HAND, (i + 1) * TILES_PER_HAND)),
    pool: deck.slice(PLAYERS * TILES_PER_HAND),
    chain: [],
    ends: null,
    turn: starter,
    passes: 0,
    lastMover: null,
  };
}

export const sameTile = (a: Tile, b: Tile) =>
  (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);

export const teamOf = (p: number): 0 | 1 => (p % 2) as 0 | 1;

export function canPlay(s: GameState, t: Tile, side: Side): boolean {
  if (!s.ends) return true;
  const end = side === 'left' ? s.ends[0] : s.ends[1];
  return t[0] === end || t[1] === end;
}

/** Jugadas legales del jugador (sin duplicar cuando ambos lados dan lo mismo). */
export function legalMoves(s: GameState, player: number): Move[] {
  const moves: Move[] = [];
  for (const tile of s.hands[player]) {
    if (!s.ends) {
      moves.push({ tile, side: 'left' });
      continue;
    }
    if (canPlay(s, tile, 'left')) moves.push({ tile, side: 'left' });
    if (canPlay(s, tile, 'right')) moves.push({ tile, side: 'right' });
  }
  return moves;
}

export function hasPlay(s: GameState, player: number): boolean {
  return s.hands[player].some((t) => canPlay(s, t, 'left') || canPlay(s, t, 'right'));
}

export function play(s: GameState, player: number, t: Tile, side: Side): Result {
  assertPlayer(player);
  if (side !== 'left' && side !== 'right') throw new Error('Lado inválido');
  if (player !== s.turn) throw new Error('No es tu turno');
  const hand = s.hands[player];
  const idx = hand.findIndex((h) => sameTile(h, t));
  if (idx < 0) throw new Error('No tienes esa ficha');
  const tile = hand[idx];
  if (!canPlay(s, tile, side)) throw new Error('Jugada inválida');

  // Capicúa: la última ficha entraba por los dos extremos.
  const fitsBoth = !!s.ends && canPlay(s, tile, 'left') && canPlay(s, tile, 'right');

  hand.splice(idx, 1);
  if (!s.ends) {
    s.ends = [tile[0], tile[1]];
    s.chain.push([tile[0], tile[1]]);
  } else if (side === 'left') {
    const outer = tile[0] === s.ends[0] ? tile[1] : tile[0];
    s.chain.unshift([outer, s.ends[0]]);
    s.ends[0] = outer;
  } else {
    const outer = tile[0] === s.ends[1] ? tile[1] : tile[0];
    s.chain.push([s.ends[1], outer]);
    s.ends[1] = outer;
  }

  s.passes = 0;
  s.lastMover = player;
  if (hand.length === 0) return { type: 'pegado', player, capicua: fitsBoth };
  s.turn = (s.turn + 1) % PLAYERS;
  return { type: 'continue' };
}

export function pass(s: GameState, player: number): Result {
  assertPlayer(player);
  if (player !== s.turn) throw new Error('No es tu turno');
  if (hasPlay(s, player)) throw new Error('Tienes jugada, no puedes pasar');
  s.passes++;
  if (s.passes === PLAYERS) return { type: 'tranque' };
  s.turn = (s.turn + 1) % PLAYERS;
  return { type: 'continue' };
}

function assertPlayer(p: number) {
  if (!Number.isInteger(p) || p < 0 || p >= PLAYERS) throw new Error('Jugador inválido');
}
