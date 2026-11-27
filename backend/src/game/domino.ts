/**
 * Motor del juego de dominó (doble nueve: 55 fichas).
 *
 * Reglas:
 * - 4 jugadores: por parejas (asientos 0 y 2 contra 1 y 3), 10 fichas cada uno, sin pozo;
 *   las 15 fichas sobrantes quedan fuera de juego ("duermen").
 * - 2 o 3 jugadores: individual, 10 fichas cada uno; las fichas sobrantes forman el pozo.
 *   Si no puedes jugar debes robar del pozo hasta poder; si el pozo está vacío, pasas.
 * - Sorteo de la salida (antes de la primera mano): las 55 fichas se ponen boca abajo y un
 *   jugador de cada pareja (o cada jugador, en individual) levanta una. La ficha más alta
 *   (más puntos; si empatan, la de la cara más alta) decide quién sale.
 * - Por parejas, la pareja que sale "discute la salida": uno pide salir y su compañero
 *   tiene que aceptarlo. Hasta que no se pongan de acuerdo nadie juega.
 *   En las siguientes manos sale la pareja que ganó la anterior, del mismo modo.
 * - Individual: sale el ganador del sorteo y, después, el ganador de la mano anterior.
 * - Quien sale puede abrir con la ficha que quiera.
 * - Si un jugador se queda sin fichas ("dominó"), su bando gana la suma de puntos
 *   de todas las fichas que quedan en las manos.
 * - Si nadie puede jugar ("tranque"), gana el jugador con menos puntos en la mano en ese
 *   momento; su bando se lleva la suma de todas las fichas restantes. Si empatan jugadores
 *   de bandos distintos, nadie suma.
 * - Gana la partida el primer bando que llegue a la puntuación objetivo.
 */

export type Tile = [number, number];

/** Número más alto del juego (doble nueve). */
export const MAX_PIP = 9;
/** Fichas que recibe cada jugador. */
export const HAND_SIZE = 10;
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

/**
 * - picking: sorteo boca abajo para decidir quién sale.
 * - agreeing: la pareja que sale decide quién de los dos abre.
 */
export type Phase = 'picking' | 'agreeing' | 'playing' | 'roundOver' | 'gameOver';

export interface StartPick {
  /** Fichas boca abajo del sorteo. */
  deck: Tile[];
  /** Fichas levantadas: posición en `deck` y jugador que la levantó. */
  picks: { index: number; player: number }[];
  /** Jugador que sacó la ficha más alta (cuando ya han levantado todos). */
  winner: number | null;
}
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
  /** Fichas que no se reparten ni se pueden robar (con 4 jugadores). */
  sleeping: Tile[];
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
  /** Sorteo de la salida de la primera mano. */
  pick: StartPick | null;
  /** Bando que debe decidir quién sale (fase `agreeing`). */
  startSide: number | null;
  /** Jugador que ha pedido salir y espera la respuesta de su compañero. */
  startRequest: number | null;
  /** Último jugador que rechazó una petición de salida (para avisar). */
  startRejectedBy: number | null;
  /** Resultado de cada mano terminada, para el acumulado de puntos. */
  history: HistoryEntry[];
}

export interface HistoryEntry {
  round: number;
  reason: 'domino' | 'tranque';
  winnerSide: number | null;
  winnerPlayer: number | null;
  points: number;
  /** Marcador de cada bando después de esta mano. */
  scores: number[];
}

export class GameError extends Error {}

export type Rng = () => number;

export function fullSet(): Tile[] {
  const tiles: Tile[] = [];
  for (let i = 0; i <= MAX_PIP; i++) for (let j = i; j <= MAX_PIP; j++) tiles.push([i, j]);
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
    sleeping: [],
    turn: -1,
    phase: 'picking',
    scores: mode === 'teams' ? [0, 0] : players.map(() => 0),
    targetScore,
    round: 0,
    consecutivePasses: 0,
    requiredOpening: null,
    lastResult: null,
    nextStarter: -1,
    log: [],
    pick: { deck: shuffle(fullSet(), rng), picks: [], winner: null },
    startSide: null,
    startRequest: null,
    startRejectedBy: null,
    history: [],
  };
  return state;
}

/** Valor de una ficha en el sorteo: más puntos gana; a igualdad, la cara más alta. */
export const pickScore = (t: Tile) => pips(t) * 10 + Math.max(t[0], t[1]);

/** Bandos que todavía no han levantado ficha en el sorteo. */
export function sidesPendingPick(state: GameState): number[] {
  if (state.phase !== 'picking' || !state.pick) return [];
  const done = new Set(state.pick.picks.map((p) => sideOf(state, p.player)));
  return state.scores.map((_, side) => side).filter((side) => !done.has(side));
}

/** Un jugador levanta una ficha boca abajo en el sorteo de la salida. */
export function pickStartTile(state: GameState, playerIndex: number, index: number, rng: Rng = Math.random): void {
  if (state.phase !== 'picking' || !state.pick) throw new GameError('No se está sorteando la salida');
  const pick = state.pick;
  if (!Number.isInteger(index) || index < 0 || index >= pick.deck.length) throw new GameError('Ficha no válida');
  if (pick.picks.some((p) => p.index === index)) throw new GameError('Esa ficha ya está levantada');
  const side = sideOf(state, playerIndex);
  if (!sidesPendingPick(state).includes(side)) {
    throw new GameError(state.mode === 'teams' ? 'Tu pareja ya levantó su ficha' : 'Ya levantaste tu ficha');
  }
  pick.picks.push({ index, player: playerIndex });
  if (sidesPendingPick(state).length > 0) return;

  // Ya levantaron todos: la ficha más alta decide quién sale.
  const best = pick.picks.reduce((a, b) => (pickScore(pick.deck[b.index]) > pickScore(pick.deck[a.index]) ? b : a));
  pick.winner = best.player;
  state.nextStarter = best.player;
  dealRound(state, rng);
}

/** Reparte una nueva mano y prepara la salida. */
export function dealRound(state: GameState, rng: Rng = Math.random): void {
  const deck = shuffle(fullSet(), rng);
  for (const p of state.players) p.hand = deck.splice(0, HAND_SIZE);
  // Por parejas no se roba: las sobrantes duermen. Individual: forman el pozo.
  state.boneyard = state.mode === 'teams' ? [] : deck;
  state.sleeping = state.mode === 'teams' ? deck : [];
  state.board = [];
  state.consecutivePasses = 0;
  state.round += 1;
  state.log = [];
  state.requiredOpening = null;
  state.startRequest = null;
  state.startRejectedBy = null;
  if (state.round > 1) state.pick = null;

  if (state.mode === 'teams') {
    // La pareja que sale tiene que ponerse de acuerdo en quién abre.
    state.phase = 'agreeing';
    state.turn = -1;
    state.startSide = sideOf(state, state.nextStarter);
  } else {
    state.phase = 'playing';
    state.turn = state.nextStarter;
    state.startSide = null;
    autoPass(state);
  }
}

function assertAgreeing(state: GameState, playerIndex: number) {
  if (state.phase !== 'agreeing') throw new GameError('No se está decidiendo la salida');
  if (sideOf(state, playerIndex) !== state.startSide) throw new GameError('La salida le toca a la otra pareja');
}

/** Un jugador de la pareja que sale pide salir; su compañero tiene que aceptarlo. */
export function requestStart(state: GameState, playerIndex: number): void {
  assertAgreeing(state, playerIndex);
  if (state.startRequest === playerIndex) return;
  if (state.startRequest !== null) throw new GameError('Tu compañero ya pidió salir: respóndele');
  state.startRequest = playerIndex;
  state.startRejectedBy = null;
}

/**
 * El compañero responde a la petición de salida. Si acepta, sale quien lo pidió;
 * si no, nadie sale y hay que volver a pedirlo. Quien pidió salir puede retirarlo.
 */
export function respondStart(state: GameState, playerIndex: number, accept: boolean): void {
  assertAgreeing(state, playerIndex);
  const req = state.startRequest;
  if (req === null) throw new GameError('Nadie ha pedido salir');
  if (req === playerIndex) {
    state.startRequest = null; // retira su petición
    return;
  }
  if (!accept) {
    state.startRequest = null;
    state.startRejectedBy = playerIndex;
    return;
  }
  state.startRequest = null;
  state.startRejectedBy = null;
  state.startSide = null;
  state.phase = 'playing';
  state.turn = req;
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
    // Gana el jugador con menos puntos en la mano (y con él, su pareja).
    // Si empatan jugadores de bandos distintos, nadie gana.
    const min = Math.min(...hp);
    const lowest = hp.map((p, i) => (p === min ? i : -1)).filter((i) => i >= 0);
    const sides = new Set(lowest.map((i) => sideOf(state, i)));
    if (sides.size === 1) {
      winnerSide = sideOf(state, lowest[0]);
      winnerPlayer = lowest[0];
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
  state.history.push({ round: state.round, reason, winnerSide, winnerPlayer, points, scores: [...state.scores] });
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
