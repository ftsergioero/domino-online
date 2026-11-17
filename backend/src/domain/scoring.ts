import { GameState, Result, Tile, teamOf } from './domino.engine';

export interface ScoringRules {
  target: number; // 100
  countAllHands: boolean; // true: fichas de los 4; false: solo rivales
  tranqueByIndividual: boolean; // true: gana el jugador con menos; false: la pareja
}

export const DEFAULT_RULES: ScoringRules = {
  target: 100,
  countAllHands: true,
  tranqueByIndividual: true,
};

export const pips = (h: Tile[]) => h.reduce((s, t) => s + t[0] + t[1], 0);

export interface HandOutcome {
  winnerTeam: 0 | 1 | null; // null = empate en tranque
  points: number;
}

export function scoreHand(s: GameState, r: Result, rules: ScoringRules = DEFAULT_RULES): HandOutcome {
  if (r.type === 'continue') throw new Error('La mano no ha terminado');

  let winnerTeam: 0 | 1 | null;
  if (r.type === 'pegado') {
    winnerTeam = teamOf(r.player);
  } else if (rules.tranqueByIndividual) {
    const totals = s.hands.map(pips);
    const min = Math.min(...totals);
    const teams = new Set(totals.flatMap((t, i) => (t === min ? [teamOf(i)] : [])));
    winnerTeam = teams.size === 1 ? [...teams][0] : null;
  } else {
    const t0 = pips(s.hands[0]) + pips(s.hands[2]);
    const t1 = pips(s.hands[1]) + pips(s.hands[3]);
    winnerTeam = t0 === t1 ? null : t0 < t1 ? 0 : 1;
  }

  if (winnerTeam === null) return { winnerTeam, points: 0 };

  const points = s.hands.reduce(
    (sum, h, i) => (rules.countAllHands || teamOf(i) !== winnerTeam ? sum + pips(h) : sum),
    0,
  );
  return { winnerTeam, points };
}

export interface Match {
  score: [number, number];
  rules: ScoringRules;
  nextStarter: number;
}

export function newMatch(rules: ScoringRules = DEFAULT_RULES, starter = 0): Match {
  return { score: [0, 0], rules: { ...rules }, nextStarter: starter };
}

export function applyHand(m: Match, o: HandOutcome) {
  if (o.winnerTeam !== null) m.score[o.winnerTeam] += o.points;
  m.nextStarter = (m.nextStarter + 1) % 4;
  const winner = m.score.findIndex((x) => x >= m.rules.target);
  return { score: m.score, matchWinner: winner >= 0 ? (winner as 0 | 1) : null };
}
