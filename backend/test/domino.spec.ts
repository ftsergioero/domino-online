import {
  GameState, Tile, createGame, drawTile, fullSet, handPoints, legalMoves, nextRound, pickStartTile,
  playTile, requestStart, respondStart, sideOf,
} from '../src/game/domino';

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i}` }));

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function tilesInPlay(g: GameState): Tile[] {
  return [...g.players.flatMap((p) => p.hand), ...g.boneyard, ...g.sleeping, ...g.board.map((b) => [b.a, b.b] as Tile)];
}

/** Hace el sorteo (si toca) y el acuerdo de salida, hasta que la mano está en juego. */
function begin(g: GameState, rng: () => number = Math.random): GameState {
  if (g.phase === 'picking') {
    let next = 0;
    for (let i = 0; i < g.players.length && g.phase === 'picking'; i++) {
      try {
        pickStartTile(g, i, next, rng);
        next++;
      } catch {
        /* su bando ya levantó */
      }
    }
  }
  if (g.phase === 'agreeing') {
    const team = g.players.map((_, i) => i).filter((i) => sideOf(g, i) === g.startSide);
    const who = team[Math.floor(rng() * team.length)];
    requestStart(g, who);
    respondStart(g, team.find((i) => i !== who)!, true);
  }
  return g;
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
    // La ficha de salida sigue localizada aunque se juegue por la izquierda.
    if (g.board.length) expect(g.boardOrigin).toBe(g.log.filter((l) => l.action === 'play' && l.side === 'left').length - (g.log.find((l) => l.action === 'play')?.side === 'left' ? 1 : 0));
    expect(tilesInPlay(g)).toHaveLength(55);
  }
}

describe('motor de dominó', () => {
  test('el juego completo tiene 55 fichas distintas (doble nueve)', () => {
    const set = fullSet();
    expect(set).toHaveLength(55);
    expect(new Set(set.map((t) => t.join('-'))).size).toBe(55);
    expect(Math.max(...set.flat())).toBe(9);
  });

  test('reparte 10 fichas y el pozo según el número de jugadores', () => {
    const g4 = begin(createGame(players(4)));
    expect(g4.players.every((p) => p.hand.length === 10)).toBe(true);
    expect(g4.boneyard).toHaveLength(0);
    expect(g4.sleeping).toHaveLength(15);
    expect(begin(createGame(players(3))).boneyard).toHaveLength(25);
    expect(begin(createGame(players(2))).boneyard).toHaveLength(35);
    expect(createGame(players(4)).mode).toBe('teams');
    expect(createGame(players(2)).scores).toEqual([0, 0]);
    expect(createGame(players(3)).scores).toEqual([0, 0, 0]);
  });

  test('sorteo boca abajo: un jugador por pareja y sale la pareja de la ficha más alta', () => {
    const g = createGame(players(4), 100, seeded(1));
    expect(g.phase).toBe('picking');
    expect(g.pick!.deck).toHaveLength(55);
    expect(g.players.every((p) => p.hand.length === 0)).toBe(true);
    g.pick!.deck[3] = [9, 8];
    g.pick!.deck[7] = [5, 4];
    pickStartTile(g, 1, 7);
    expect(() => pickStartTile(g, 3, 8)).toThrow('Tu pareja ya levantó su ficha');
    expect(() => pickStartTile(g, 0, 7)).toThrow('Esa ficha ya está levantada');
    pickStartTile(g, 2, 3);
    expect(g.pick!.winner).toBe(2);
    expect(g.phase).toBe('agreeing');
    expect(g.startSide).toBe(0);
    expect(g.players.every((p) => p.hand.length === 10)).toBe(true);
    expect(legalMoves(g, 0)).toHaveLength(0);
  });

  test('a igualdad de puntos gana la ficha con la cara más alta', () => {
    const g = createGame(players(2), 100, seeded(2));
    g.pick!.deck[0] = [5, 4];
    g.pick!.deck[1] = [9, 0];
    pickStartTile(g, 0, 0);
    pickStartTile(g, 1, 1);
    expect(g.pick!.winner).toBe(1);
    expect(g.phase).toBe('playing');
    expect(g.turn).toBe(1);
  });

  test('discutir la salida: el compañero tiene que aceptar; si no, nadie sale', () => {
    const g = createGame(players(4), 100, seeded(4));
    g.pick!.deck[0] = [9, 9];
    pickStartTile(g, 1, 0);
    pickStartTile(g, 0, 1);
    expect(g.startSide).toBe(1);
    expect(() => requestStart(g, 0)).toThrow('La salida le toca a la otra pareja');
    requestStart(g, 1);
    expect(() => requestStart(g, 3)).toThrow('Tu compañero ya pidió salir');
    respondStart(g, 3, false);
    expect(g.phase).toBe('agreeing');
    expect(g.startRequest).toBeNull();
    expect(g.startRejectedBy).toBe(3);
    requestStart(g, 3);
    respondStart(g, 3, true); // quien pidió no puede aceptarse a sí mismo: lo retira
    expect(g.startRequest).toBeNull();
    expect(g.phase).toBe('agreeing');
    requestStart(g, 3);
    respondStart(g, 1, true);
    expect(g.phase).toBe('playing');
    expect(g.turn).toBe(3);
    // Puede abrir con cualquier ficha.
    expect(legalMoves(g, 3)).toHaveLength(10);
  });

  test('no se puede jugar fuera de turno ni robar teniendo jugada', () => {
    const g = begin(createGame(players(2), 100, seeded(7)));
    expect(() => playTile(g, (g.turn + 1) % 2, 0, 'left')).toThrow('No es tu turno');
    expect(() => drawTile(g, g.turn)).toThrow('Tienes fichas para jugar');
  });

  test('orienta las fichas al colocarlas en cada extremo', () => {
    const g = begin(createGame(players(2), 100, seeded(3)));
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
    const g = begin(createGame(players(4), 100, seeded(5)));
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
    // Sale la pareja ganadora, que tiene que ponerse de acuerdo.
    expect(g.phase).toBe('agreeing');
    expect(g.startSide).toBe(1);
    expect(g.pick).toBeNull();
  });

  test('tranque: gana el bando con menos puntos', () => {
    const g = begin(createGame(players(4), 100, seeded(9)));
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

  test('tranque: gana el jugador con menos puntos aunque su pareja sume más', () => {
    const g = begin(createGame(players(4), 100, seeded(11)));
    g.board = [{ a: 0, b: 5 }];
    g.turn = 0;
    g.players[0].hand = [[5, 0], [1, 1]]; // tras jugar le quedan 2 puntos
    g.players[1].hand = [[4, 4]]; // 8
    g.players[2].hand = [[9, 9], [8, 8]]; // 34
    g.players[3].hand = [[3, 4]]; // 7
    playTile(g, 0, 0, 'right');
    expect(g.lastResult?.reason).toBe('tranque');
    // Por parejas: 36 contra 15, pero quien menos tiene es el jugador 0.
    expect(g.lastResult?.winnerPlayer).toBe(0);
    expect(g.lastResult?.winnerSide).toBe(0);
    expect(g.scores).toEqual([51, 0]);
  });

  test('tranque: empate entre jugadores de parejas distintas, nadie suma', () => {
    const g = begin(createGame(players(4), 100, seeded(12)));
    g.board = [{ a: 0, b: 5 }];
    g.turn = 0;
    g.players[0].hand = [[5, 0], [1, 2]]; // 3
    g.players[1].hand = [[1, 2]]; // 3
    g.players[2].hand = [[4, 4]];
    g.players[3].hand = [[3, 4]];
    playTile(g, 0, 0, 'right');
    expect(g.lastResult?.winnerSide).toBeNull();
    expect(g.scores).toEqual([0, 0]);
  });

  test('simulación de miles de partidas sin romper reglas', () => {
    for (let n = 2; n <= 4; n++) {
      for (let s = 0; s < 300; s++) {
        const rng = seeded(s * 31 + n);
        const g = begin(createGame(players(n), 100, rng), rng);
        let rounds = 0;
        for (;;) {
          playRound(g, rng);
          const r = g.lastResult!;
          if (r.reason === 'domino') expect(r.handPoints[r.winnerPlayer!]).toBe(0);
          expect(r.points).toBe(r.winnerSide === null ? 0 : r.handPoints.reduce((a, b) => a + b, 0));
          if (g.phase === 'gameOver') break;
          if (++rounds > 200) throw new Error('la partida no termina');
          nextRound(g, rng);
          begin(g, rng);
        }
        expect(Math.max(...g.scores)).toBeGreaterThanOrEqual(100);
        // El historial cuadra con el marcador.
        expect(g.history).toHaveLength(g.round);
        expect(g.history.at(-1)!.scores).toEqual(g.scores);
        const sums = g.scores.map((_, side) =>
          g.history.filter((h) => h.winnerSide === side).reduce((a, h) => a + h.points, 0),
        );
        expect(sums).toEqual(g.scores);
      }
    }
  });

  test('suma de puntos de una mano', () => {
    expect(handPoints([[6, 6], [0, 1]])).toBe(13);
  });
});
