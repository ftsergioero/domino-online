import {
  GameState,
  Tile,
  canPlay,
  createTiles,
  hasPlay,
  legalMoves,
  newGame,
  pass,
  play,
} from './domino.engine';

function state(partial: Partial<GameState>): GameState {
  return {
    hands: [[], [], [], []],
    pool: [],
    chain: [],
    ends: null,
    turn: 0,
    passes: 0,
    lastMover: null,
    ...partial,
  };
}

const key = (t: Tile) => `${Math.min(...t)}-${Math.max(...t)}`;

describe('createTiles', () => {
  it('crea las 55 fichas del doble nueve sin repetir', () => {
    const tiles = createTiles();
    expect(tiles).toHaveLength(55);
    expect(new Set(tiles.map(key)).size).toBe(55);
    expect(tiles.every(([a, b]) => a >= 0 && b <= 9 && a <= b)).toBe(true);
  });
});

describe('newGame', () => {
  it('reparte 10 fichas a cada jugador y deja 15 fuera', () => {
    const g = newGame(2);
    expect(g.hands.map((h) => h.length)).toEqual([10, 10, 10, 10]);
    expect(g.pool).toHaveLength(15);
    const all = [...g.hands.flat(), ...g.pool].map(key);
    expect(new Set(all).size).toBe(55);
    expect(g.turn).toBe(2);
    expect(g.ends).toBeNull();
  });

  it('rechaza un salidor inválido', () => {
    expect(() => newGame(4)).toThrow();
  });
});

describe('play', () => {
  it('la primera ficha fija los extremos', () => {
    const s = state({ hands: [[[6, 6], [1, 2]], [], [], []] });
    expect(play(s, 0, [6, 6], 'right')).toEqual({ type: 'continue' });
    expect(s.ends).toEqual([6, 6]);
    expect(s.chain).toEqual([[6, 6]]);
    expect(s.turn).toBe(1);
    expect(s.lastMover).toBe(0);
  });

  it('actualiza los extremos y orienta la cadena', () => {
    const s = state({ ends: [3, 5], chain: [[3, 5]], turn: 1, hands: [[], [[5, 9], [0, 0]], [], []] });
    play(s, 1, [9, 5], 'right'); // se acepta la ficha en cualquier orden
    expect(s.ends).toEqual([3, 9]);
    expect(s.chain).toEqual([[3, 5], [5, 9]]);

    s.hands[2] = [[3, 7], [1, 1]];
    play(s, 2, [3, 7], 'left');
    expect(s.ends).toEqual([7, 9]);
    expect(s.chain).toEqual([[7, 3], [3, 5], [5, 9]]);
    // La cadena siempre encaja
    for (let i = 0; i < s.chain.length - 1; i++) expect(s.chain[i][1]).toBe(s.chain[i + 1][0]);
  });

  it('valida turno, ficha y extremo', () => {
    const s = state({ ends: [3, 5], chain: [[3, 5]], hands: [[[1, 2], [5, 5]], [[3, 3]], [], []] });
    expect(() => play(s, 1, [3, 3], 'left')).toThrow('No es tu turno');
    expect(() => play(s, 0, [9, 9], 'left')).toThrow('No tienes esa ficha');
    expect(() => play(s, 0, [1, 2], 'left')).toThrow('Jugada inválida');
    expect(() => play(s, 0, [5, 5], 'left')).toThrow('Jugada inválida');
    expect(() => play(s, 0, [5, 5], 'up' as any)).toThrow('Lado inválido');
    // Nada cambió tras los errores
    expect(s.hands[0]).toHaveLength(2);
    expect(s.ends).toEqual([3, 5]);
  });

  it('detecta pegado y reinicia los pases', () => {
    const s = state({ ends: [4, 2], chain: [[4, 2]], passes: 2, hands: [[[2, 8]], [], [], []] });
    expect(play(s, 0, [2, 8], 'right')).toEqual({ type: 'pegado', player: 0, capicua: false });
    expect(s.passes).toBe(0);
    expect(s.turn).toBe(0); // el turno no avanza al terminar la mano
  });

  it('detecta capicúa cuando la última ficha entra por los dos lados', () => {
    const s = state({ ends: [4, 2], chain: [[4, 2]], hands: [[[2, 4]], [], [], []] });
    expect(play(s, 0, [2, 4], 'left')).toEqual({ type: 'pegado', player: 0, capicua: true });
  });
});

describe('pass', () => {
  it('no deja pasar si se tiene jugada', () => {
    const s = state({ ends: [1, 2], chain: [[1, 2]], hands: [[[2, 9]], [], [], []] });
    expect(() => pass(s, 0)).toThrow('Tienes jugada');
  });

  it('avanza el turno y declara tranque con 4 pases seguidos', () => {
    const s = state({ ends: [1, 1], chain: [[1, 1]], hands: [[[0, 0]], [[2, 2]], [[3, 3]], [[4, 4]]] });
    expect(pass(s, 0)).toEqual({ type: 'continue' });
    expect(pass(s, 1)).toEqual({ type: 'continue' });
    expect(pass(s, 2)).toEqual({ type: 'continue' });
    expect(pass(s, 3)).toEqual({ type: 'tranque' });
  });

  it('una jugada reinicia la cuenta de pases', () => {
    const s = state({ ends: [1, 5], chain: [[1, 5]], hands: [[[0, 0]], [[2, 2]], [[5, 6], [9, 9]], [[4, 4]]] });
    pass(s, 0);
    pass(s, 1);
    play(s, 2, [5, 6], 'right');
    expect(s.passes).toBe(0);
    expect(pass(s, 3)).toEqual({ type: 'continue' });
  });
});

describe('canPlay / legalMoves / hasPlay', () => {
  it('con la mesa vacía todo vale', () => {
    const s = state({ hands: [[[1, 2], [3, 4]], [], [], []] });
    expect(canPlay(s, [1, 2], 'left')).toBe(true);
    expect(legalMoves(s, 0)).toHaveLength(2);
  });

  it('lista jugadas por lado', () => {
    const s = state({ ends: [3, 5], chain: [[3, 5]], hands: [[[3, 5], [5, 1], [0, 0]], [], [], []] });
    expect(legalMoves(s, 0)).toEqual([
      { tile: [3, 5], side: 'left' },
      { tile: [3, 5], side: 'right' },
      { tile: [5, 1], side: 'right' },
    ]);
    expect(hasPlay(s, 0)).toBe(true);
    s.hands[0] = [[0, 0]];
    expect(hasPlay(s, 0)).toBe(false);
  });
});

describe('partidas aleatorias completas', () => {
  it('mantienen las invariantes hasta pegado o tranque', () => {
    for (let n = 0; n < 300; n++) {
      const s = newGame(n % 4);
      let result: ReturnType<typeof play> = { type: 'continue' };
      let guard = 0;
      while (result.type === 'continue') {
        if (++guard > 500) throw new Error('bucle infinito');
        const moves = legalMoves(s, s.turn);
        const m = moves[Math.floor(Math.random() * moves.length)];
        result = m ? play(s, s.turn, m.tile, m.side) : pass(s, s.turn);
        for (let i = 0; i < s.chain.length - 1; i++) expect(s.chain[i][1]).toBe(s.chain[i + 1][0]);
        if (s.ends) {
          expect(s.chain[0][0]).toBe(s.ends[0]);
          expect(s.chain[s.chain.length - 1][1]).toBe(s.ends[1]);
        }
      }
      const total = s.hands.flat().length + s.chain.length + s.pool.length;
      expect(total).toBe(55);
      if (result.type === 'pegado') expect(s.hands[result.player]).toHaveLength(0);
      if (result.type === 'tranque') for (let p = 0; p < 4; p++) expect(hasPlay(s, p)).toBe(false);
    }
  });
});
