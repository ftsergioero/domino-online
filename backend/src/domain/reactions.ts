import { Result, teamOf } from './domino.engine';
import { HandOutcome } from './scoring';

export const REACTION_EVENTS = [
  'pegarse',
  'pasar',
  'tranque',
  'capicua',
  'ganar_mano',
  'perder_mano',
  'ganar_partida',
  'perder_partida',
] as const;
export type ReactionEvent = (typeof REACTION_EVENTS)[number];

export interface ReactionConfig {
  event: ReactionEvent;
  gesture: string; // nombre de la animación / input de la máquina de estados de Rive
  phrase: string;
}

export interface TriggeredEvent {
  seat: number;
  event: ReactionEvent;
}

export const isReactionEvent = (e: unknown): e is ReactionEvent =>
  typeof e === 'string' && (REACTION_EVENTS as readonly string[]).includes(e);

/**
 * Traduce lo ocurrido en una acción (jugada o pase) a eventos de reacción por asiento.
 * `actor` es quien jugó/pasó, `lastMover` quien colocó la última ficha (el que trancó).
 */
export function detectEvents(args: {
  action: 'play' | 'pass';
  actor: number;
  result: Result;
  lastMover: number | null;
  outcome?: HandOutcome;
  matchWinner?: 0 | 1 | null;
}): TriggeredEvent[] {
  const { action, actor, result, lastMover, outcome, matchWinner } = args;
  const events: TriggeredEvent[] = [];
  if (action === 'pass') events.push({ seat: actor, event: 'pasar' });
  if (result.type === 'pegado') {
    events.push({ seat: actor, event: 'pegarse' });
    if (result.capicua) events.push({ seat: actor, event: 'capicua' });
  }
  if (result.type === 'tranque' && lastMover !== null) {
    events.push({ seat: lastMover, event: 'tranque' });
  }
  if (outcome && outcome.winnerTeam !== null) {
    for (let seat = 0; seat < 4; seat++) {
      const won = teamOf(seat) === outcome.winnerTeam;
      if (matchWinner !== null && matchWinner !== undefined) {
        events.push({ seat, event: teamOf(seat) === matchWinner ? 'ganar_partida' : 'perder_partida' });
      } else {
        events.push({ seat, event: won ? 'ganar_mano' : 'perder_mano' });
      }
    }
  }
  return events;
}

export function findReaction(reactions: ReactionConfig[] | undefined, event: ReactionEvent) {
  return reactions?.find((r) => r.event === event);
}
