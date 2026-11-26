/**
 * Motor del juego de dominó (doble seis).
 *
 * Reglas:
 * - 4 jugadores: por parejas (asientos 0 y 2 contra 1 y 3), 7 fichas cada uno, sin pozo.
 * - 2 o 3 jugadores: individual, 7 fichas cada uno; las fichas sobrantes forman el pozo.
 *   Si no puedes jugar debes robar del pozo hasta poder; si el pozo está vacío, pasas.
 * - Primera mano: sale quien tenga el doble más alto (y debe jugarlo).
 *   Siguientes manos: sale el ganador de la mano anterior con la ficha que quiera.
 * - Si un jugador se queda sin fichas ("dominó"), su bando gana la suma de puntos
 *   de todas las fichas que quedan en las manos.
 * - Si nadie puede jugar ("tranque"), gana el bando con menos puntos en la mano y se
 *   lleva la suma de todas las fichas restantes. En caso de empate nadie suma.
 * - Gana la partida el primer bando que llegue a la puntuación objetivo.
 */

export type Tile = [number, number];
export type Side = 'left' | 'right';

/** Ficha colocada en la mesa, orientada: `a` queda a la izquierda y `b` a la derecha. */
export interface PlacedTile {
  a: number;
  b: number;
}

export interface GamePlayer {
  id: string;
  name: string;
  hand: Tile[];
}

export type Phase = 'playing' | 'roundOver' | 'gameOver';
export type Mode = 'teams' | 'individual';

export interface RoundResult {
  reason: 'domino' | 'tranque';
  /** Bando ganador (índice de equipo o de jugador), o null si hubo empate en un tranque. */
  winnerSide: number | null;
  /** Jugador que cerró la mano (dominó) o con menos puntos (tranque). */
  winnerPlayer: number | null;
  points: number;
  /** Puntos que quedaban en la mano de cada jugador al terminar. */
  handPoints: number[];
  /** Fichas que tenía cada jugador al terminar (se muestran a todos). */
  hands: Tile[][];
}

export interface LogEntry {
  player: number;
  action: 'play' | 'draw' | 'pass';
  tile?: Tile;
  side?: Side;
}

export interface GameState {
  mode: Mode;
  players: GamePlayer[];
  board: PlacedTile[];
  boneyard: Tile[];
  turn: number;
  phase: Phase;
  scores: number[];
  targetScore: number;
  round: number;
  consecutivePasses: number;
  /** Ficha obligatoria para abrir la primera mano. */
  requiredOpening: Tile | null;
  lastResult: RoundResult | null;
  nextStarter: number;
  log: LogEntry[];
}

export class GameError extends Error {}

export type Rng = () => number;

export function fullSet(): Tile[] {
  const tiles: Tile[] = [];
  for (let i = 0; i <= 6; i++) for (let j = i; j <= 6; j++) tiles.push([i, j]);
  return tiles;
}

export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const pips = (t: Tile) => t[0] + t[1];
export const handPoints = (hand: Tile[]) => hand.reduce((s, t) => s + pips(t), 0);
export const sameTile = (x: Tile, y: Tile) =>
  (x[0] === y[0] && x[1] === y[1]) || (x[0] === y[1] && x[1] === y[0]);

export function sideOf(state: Pick<GameState, 'mode' | 'players'>, playerIndex: number): number {
  return state.mode === 'teams' ? playerIndex % 2 : playerIndex;
}

export function boardEnds(board: PlacedTile[]): { left: number; right: number } | null {
  if (board.length === 0) return null;
  return { left: board[0].a, right: board[board.length - 1].b };
}

/** Lados en los que se puede colocar una ficha dada la mesa actual. */
export function playableSides(state: GameState, tile: Tile): Side[] {
  const ends = boardEnds(state.board);
  if (!ends) {
    if (state.requiredOpening && !sameTile(state.requiredOpening, tile)) return [];
    return ['left'];
  }
  const sides: Side[] = [];
  if (tile[0] === ends.left || tile[1] === ends.left) sides.push('left');
  if (tile[0] === ends.right || tile[1] === ends.right) sides.push('right');
  // Si ambos extremos tienen el mismo número, da igual el lado: ofrecemos los dos.
  return sides;
}

export function legalMoves(state: GameState, playerIndex: number): { tileIndex: number; sides: Side[] }[] {
  if (state.phase !== 'playing') return [];
  return state.players[playerIndex].hand
    .map((tile, tileIndex) => ({ tileIndex, sides: playableSides(state, tile) }))
    .filter((m) => m.sides.length > 0);
}

export function createGame(
  players: { id: string; name: string }[],
  targetScore = 100,
  rng: Rng = Math.random,
): GameState {
  if (players.length < 2 || players.length > 4) {
    throw new GameError('Se necesitan entre 2 y 4 jugadores');
  }
  const mode: Mode = players.length === 4 ? 'teams' : 'individual';
  const state: GameState = {
    mode,
    players: players.map((p) => ({ id: p.id, name: p.name, hand: [] })),
    board: [],
    boneyard: [],
    turn: 0,
    phase: 'playing',
    scores: mode === 'teams' ? [0, 0] : players.map(() => 0),
    targetScore,
    round: 0,
    consecutivePasses: 0,
    requiredOpening: null,
    lastResult: null,
    nextStarter: -1,
    log: [],
  };
  dealRound(state, rng);
  return state;
}

/** Reparte una nueva mano. `nextStarter === -1` indica que sale el doble más alto. */
export function dealRound(state: GameState, rng: Rng = Math.random): void {
  const deck = shuffle(fullSet(), rng);
  for (const p of state.players) p.hand = deck.splice(0, 7);
  state.boneyard = deck;
  state.board = [];
  state.consecutivePasses = 0;
  state.round += 1;
  state.phase = 'playing';
  state.log = [];

  if (state.nextStarter >= 0) {
    state.turn = state.nextStarter;
    state.requiredOpening = null;
  } else {
    // Busca el doble más alto; si nadie tiene dobles (posible con 2-3 jugadores), la ficha más alta.
    let best: { player: number; tile: Tile; score: number } | null = null;
    state.players.forEach((p, i) => {
      for (const t of p.hand) {
        const score = t[0] === t[1] ? 100 + t[0] : pips(t) * 10 + Math.max(t[0], t[1]) - 100;
        if (!best || score > best.score) best = { player: i, tile: t, score };
      }
    });
    const b = best as unknown as { player: number; tile: Tile };
    state.turn = b.player;
    state.requiredOpening = b.tile;
  }
  autoPass(state);
}

export function playTile(state: GameState, playerIndex: number, tileIndex: number, side: Side): void {
  assertTurn(state, playerIndex);
  const player = state.players[playerIndex];
  const tile = player.hand[tileIndex];
  if (!tile) throw new GameError('Ficha no válida');
  const sides = playableSides(state, tile);
  if (sides.length === 0) throw new GameError('Esa ficha no se puede jugar');
  if (!sides.includes(side)) side = sides[0];

  const ends = boardEnds(state.board);
  if (!ends) {
    state.board.push({ a: tile[0], b: tile[1] });
  } else if (side === 'left') {
    // La cara que coincide con el extremo izquierdo queda a la derecha de la ficha.
    state.board.unshift(tile[1] === ends.left ? { a: tile[0], b: tile[1] } : { a: tile[1], b: tile[0] });
  } else {
    state.board.push(tile[0] === ends.right ? { a: tile[0], b: tile[1] } : { a: tile[1], b: tile[0] });
  }
  player.hand.splice(tileIndex, 1);
  state.requiredOpening = null;
  state.consecutivePasses = 0;
  state.log.push({ player: playerIndex, action: 'play', tile, side });

  if (player.hand.length === 0) {
    endRound(state, 'domino', playerIndex);
    return;
  }
  advance(state);
}

export function drawTile(state: GameState, playerIndex: number): void {
  assertTurn(state, playerIndex);
  if (legalMoves(state, playerIndex).length > 0) throw new GameError('Tienes fichas para jugar');
  if (state.boneyard.length === 0) throw new GameError('El pozo está vacío');
  state.players[playerIndex].hand.push(state.boneyard.pop()!);
  state.log.push({ player: playerIndex, action: 'draw' });
  // Si sigue sin poder jugar y ya no queda pozo, pasa automáticamente.
  autoPass(state);
}

function assertTurn(state: GameState, playerIndex: number) {
  if (state.phase !== 'playing') throw new GameError('La mano no está en juego');
  if (state.turn !== playerIndex) throw new GameError('No es tu turno');
}

function advance(state: GameState) {
  state.turn = (state.turn + 1) % state.players.length;
  autoPass(state);
}

/** Pasa automáticamente a los jugadores que no pueden jugar ni robar. */
function autoPass(state: GameState) {
  while (state.phase === 'playing') {
    if (legalMoves(state, state.turn).length > 0 || state.boneyard.length > 0) return;
    state.log.push({ player: state.turn, action: 'pass' });
    state.consecutivePasses += 1;
    if (state.consecutivePasses >= state.players.length) {
      endRound(state, 'tranque', null);
      return;
    }
    state.turn = (state.turn + 1) % state.players.length;
  }
}

function endRound(state: GameState, reason: 'domino' | 'tranque', dominoPlayer: number | null) {
  const hp = state.players.map((p) => handPoints(p.hand));
  const total = hp.reduce((a, b) => a + b, 0);
  let winnerSide: number | null = null;
  let winnerPlayer: number | null = dominoPlayer;

  if (reason === 'domino') {
    winnerSide = sideOf(state, dominoPlayer!);
  } else {
    const sidePoints = state.scores.map(() => 0);
    hp.forEach((p, i) => (sidePoints[sideOf(state, i)] += p));
    const min = Math.min(...sidePoints);
    const winners = sidePoints.map((p, i) => (p === min ? i : -1)).filter((i) => i >= 0);
    if (winners.length === 1) {
      winnerSide = winners[0];
      // Sale en la siguiente mano el jugador de ese bando con menos puntos.
      let best = -1;
      hp.forEach((p, i) => {
        if (sideOf(state, i) === winnerSide && (best < 0 || p < hp[best])) best = i;
      });
      winnerPlayer = best;
    }
  }

  const points = winnerSide === null ? 0 : total;
  if (winnerSide !== null) state.scores[winnerSide] += points;
  state.lastResult = {
    reason,
    winnerSide,
    winnerPlayer,
    points,
    handPoints: hp,
    hands: state.players.map((p) => p.hand.map((t) => [...t] as Tile)),
  };
  // Empate en tranque: sale el siguiente al que salió esta mano.
  state.nextStarter = winnerPlayer ?? (state.turn + 1) % state.players.length;
  state.phase = state.scores.some((s) => s >= state.targetScore) ? 'gameOver' : 'roundOver';
}

export function nextRound(state: GameState, rng: Rng = Math.random): void {
  if (state.phase !== 'roundOver') throw new GameError('La mano aún no ha terminado');
  dealRound(state, rng);
}

export function winningSide(state: GameState): number | null {
  if (state.phase !== 'gameOver') return null;
  const max = Math.max(...state.scores);
  return state.scores.indexOf(max);
}
