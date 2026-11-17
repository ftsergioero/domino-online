import { GameState, Tile } from './domino.engine';
import { DEFAULT_RULES, applyHand, newMatch, pips, scoreHand } from './scoring';

const withHands = (hands: Tile[][]): GameState => ({
  hands,
  pool: [],
  chain: [],
  ends: [0, 0],
  turn: 0,
  passes: 0,
  lastMover: null,
});

describe('pips', () => {
  it('suma los puntos de las fichas', () => {
    expect(pips([[1, 2], [9, 9]])).toBe(21);
    expect(pips([])).toBe(0);
  });
});

describe('scoreHand', () => {
  // Manos: j0 = 5, j1 = 10, j2 = 3, j3 = 20
  const hands: Tile[][] = [[[2, 3]], [[5, 5]], [[1, 2]], [[9, 9], [0, 2]]];

  it('no puntúa una mano sin terminar', () => {
    expect(() => scoreHand(withHands(hands), { type: 'continue' })).toThrow();
  });

  it('pegado: gana la pareja del que se pegó; cuenta las cuatro manos', () => {
    const s = withHands([[], ...hands.slice(1)]);
    expect(scoreHand(s, { type: 'pegado', player: 0, capicua: false })).toEqual({ winnerTeam: 0, points: 33 });
  });

  it('pegado contando solo las fichas de los rivales', () => {
    const s = withHands([[], ...hands.slice(1)]);
    const rules = { ...DEFAULT_RULES, countAllHands: false };
    expect(scoreHand(s, { type: 'pegado', player: 2, capicua: false }, rules)).toEqual({ winnerTeam: 0, points: 30 });
    expect(scoreHand(s, { type: 'pegado', player: 3, capicua: false }, rules)).toEqual({ winnerTeam: 1, points: 3 });
  });

  it('tranque individual: gana el jugador con menos puntos', () => {
    expect(scoreHand(withHands(hands), { type: 'tranque' })).toEqual({ winnerTeam: 0, points: 38 });
  });

  it('tranque individual: empate entre parejas no da puntos', () => {
    const s = withHands([[[1, 1]], [[0, 2]], [[5, 5]], [[6, 6]]]);
    expect(scoreHand(s, { type: 'tranque' })).toEqual({ winnerTeam: null, points: 0 });
  });

  it('tranque individual: empate dentro de la misma pareja sí gana', () => {
    const s = withHands([[[1, 1]], [[3, 3]], [[0, 2]], [[6, 6]]]);
    expect(scoreHand(s, { type: 'tranque' }).winnerTeam).toBe(0);
  });

  it('tranque por pareja: gana la pareja con menos puntos', () => {
    // pareja 0: 5 + 3 = 8; pareja 1: 10 + 20 = 30
    const rules = { ...DEFAULT_RULES, tranqueByIndividual: false, countAllHands: false };
    expect(scoreHand(withHands(hands), { type: 'tranque' }, rules)).toEqual({ winnerTeam: 0, points: 30 });
  });

  it('tranque por pareja con empate', () => {
    const s = withHands([[[1, 1]], [[0, 2]], [[3, 3]], [[3, 3]]]);
    const rules = { ...DEFAULT_RULES, tranqueByIndividual: false };
    expect(scoreHand(s, { type: 'tranque' }, rules)).toEqual({ winnerTeam: null, points: 0 });
  });
});

describe('applyHand', () => {
  it('suma puntos, rota el salidor y detecta el final a 100', () => {
    const m = newMatch();
    expect(applyHand(m, { winnerTeam: 1, points: 60 })).toEqual({ score: [0, 60], matchWinner: null });
    expect(m.nextStarter).toBe(1);
    expect(applyHand(m, { winnerTeam: null, points: 0 })).toEqual({ score: [0, 60], matchWinner: null });
    expect(applyHand(m, { winnerTeam: 1, points: 40 })).toEqual({ score: [0, 100], matchWinner: 1 });
    expect(m.nextStarter).toBe(3);
  });

  it('newMatch no comparte el objeto de reglas', () => {
    const m = newMatch();
    m.rules.target = 50;
    expect(DEFAULT_RULES.target).toBe(100);
  });
});
