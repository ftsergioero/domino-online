import {
  GameError, GameState, Tile, createGame, drawTile, fullSet, handPoints, legalMoves, nextRound, playTile,
} from '../src/game/domino';

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i}` }));

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function tilesInPlay(g: GameState): Tile[] {
  return [...g.players.flatMap((p) => p.hand), ...g.boneyard, ...g.board.map((b) => [b.a, b.b] as Tile)];
}

/** Juega una mano completa con un bot aleatorio, comprobando invariantes en cada paso. */
function playRound(g: GameState, rng: () => number) {
  let steps = 0;
  while (g.phase === 'playing') {
    if (++steps > 500) throw new Error('bucle infinito');
    const moves = legalMoves(g, g.turn);
    if (moves.length) {
      const m = moves[Math.floor(rng() * moves.length)];
      playTile(g, g.turn, m.tileIndex, m.sides[Math.floor(rng() * m.sides.length)]);
    } else {
      drawTile(g, g.turn);
    }
    // La cadena de la mesa siempre debe encajar.
    for (let i = 1; i < g.board.length; i++) expect(g.board[i - 1].b).toBe(g.board[i].a);
    expect(tilesInPlay(g)).toHaveLength(28);
  }
}

describe('motor de dominó', () => {
  test('el juego completo tiene 28 fichas distintas', () => {
    const set = fullSet();
    expect(set).toHaveLength(28);
    expect(new Set(set.map((t) => t.join('-'))).size).toBe(28);
  });

  test('reparte 7 fichas y el pozo según el número de jugadores', () => {
    expect(createGame(players(4)).boneyard).toHaveLength(0);
    expect(createGame(players(3)).boneyard).toHaveLength(7);
    expect(createGame(players(2)).boneyard).toHaveLength(14);
    expect(createGame(players(4)).mode).toBe('teams');
    expect(createGame(players(2)).scores).toEqual([0, 0]);
    expect(createGame(players(3)).scores).toEqual([0, 0, 0]);
  });

  test('con 4 jugadores sale el doble seis y es obligatorio jugarlo', () => {
    const g = createGame(players(4), 100, seeded(1));
    const starter = g.players[g.turn];
    expect(starter.hand.some((t) => t[0] === 6 && t[1] === 6)).toBe(true);
    const moves = legalMoves(g, g.turn);
    expect(moves).toHaveLength(1);
    expect(starter.hand[moves[0].tileIndex]).toEqual([6, 6]);
    const other = starter.hand.findIndex((t) => !(t[0] === 6 && t[1] === 6));
    expect(() => playTile(g, g.turn, other, 'left')).toThrow(GameError);
  });

  test('no se puede jugar fuera de turno ni robar teniendo jugada', () => {
    const g = createGame(players(2), 100, seeded(7));
    expect(() => playTile(g, (g.turn + 1) % 2, 0, 'left')).toThrow('No es tu turno');
    expect(() => drawTile(g, g.turn)).toThrow('Tienes fichas para jugar');
  });

  test('orienta las fichas al colocarlas en cada extremo', () => {
    const g = createGame(players(2), 100, seeded(3));
    g.board = [{ a: 3, b: 5 }];
    g.requiredOpening = null;
    g.players[g.turn].hand = [[5, 1], [2, 3], [0, 0]];
    playTile(g, g.turn, 0, 'right');
    expect(g.board.at(-1)).toEqual({ a: 5, b: 1 });
    g.players[g.turn].hand = [[2, 3], [0, 0]];
    playTile(g, g.turn, 0, 'left');
    expect(g.board[0]).toEqual({ a: 2, b: 3 });
  });

  test('dominó: el bando ganador suma los puntos de todas las manos', () => {
    const g = createGame(players(4), 100, seeded(5));
    g.board = [{ a: 4, b: 4 }];
    g.requiredOpening = null;
    g.turn = 1;
    g.players.forEach((p) => (p.hand = [[0, 1]]));
    g.players[1].hand = [[4, 2]];
    g.players[2].hand = [[6, 6]];
    playTile(g, 1, 0, 'right');
    expect(g.phase).toBe('roundOver');
    expect(g.lastResult).toMatchObject({ reason: 'domino', winnerSide: 1, winnerPlayer: 1, points: 1 + 12 + 1 });
    expect(g.scores).toEqual([0, 14]);
    nextRound(g);
    expect(g.turn).toBe(1);
    expect(g.requiredOpening).toBeNull();
  });

  test('tranque: gana el bando con menos puntos', () => {
    const g = createGame(players(4), 100, seeded(9));
    g.board = [{ a: 0, b: 5 }];
    g.requiredOpening = null;
    g.turn = 0;
    g.players[0].hand = [[5, 0], [6, 6]];
    g.players[1].hand = [[1, 1]];
    g.players[2].hand = [[2, 2]];
    g.players[3].hand = [[3, 4]];
    // Tras jugar [5,0] los extremos son 0 y 0: nadie más puede jugar.
    playTile(g, 0, 0, 'right');
    expect(g.lastResult?.reason).toBe('tranque');
    // Equipo 0: 12 + 4 = 16; equipo 1: 2 + 7 = 9 → gana el equipo 1.
    expect(g.lastResult?.winnerSide).toBe(1);
    expect(g.lastResult?.winnerPlayer).toBe(1);
    expect(g.scores).toEqual([0, 25]);
  });

  test('simulación de miles de partidas sin romper reglas', () => {
    for (let n = 2; n <= 4; n++) {
      for (let s = 0; s < 300; s++) {
        const rng = seeded(s * 31 + n);
        const g = createGame(players(n), 100, rng);
        let rounds = 0;
        for (;;) {
          playRound(g, rng);
          const r = g.lastResult!;
          if (r.reason === 'domino') expect(r.handPoints[r.winnerPlayer!]).toBe(0);
          expect(r.points).toBe(r.winnerSide === null ? 0 : r.handPoints.reduce((a, b) => a + b, 0));
          if (g.phase === 'gameOver') break;
          if (++rounds > 200) throw new Error('la partida no termina');
          nextRound(g, rng);
        }
        expect(Math.max(...g.scores)).toBeGreaterThanOrEqual(100);
      }
    }
  });

  test('suma de puntos de una mano', () => {
    expect(handPoints([[6, 6], [0, 1]])).toBe(13);
  });
});
