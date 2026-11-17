import { detectEvents, findReaction, isReactionEvent } from './reactions';

describe('detectEvents', () => {
  it('pase', () => {
    expect(detectEvents({ action: 'pass', actor: 2, result: { type: 'continue' }, lastMover: 1 })).toEqual([
      { seat: 2, event: 'pasar' },
    ]);
  });

  it('pegado con capicúa: reacciones del que se pega y de ganar/perder la mano', () => {
    const ev = detectEvents({
      action: 'play',
      actor: 1,
      result: { type: 'pegado', player: 1, capicua: true },
      lastMover: 1,
      outcome: { winnerTeam: 1, points: 40 },
      matchWinner: null,
    });
    expect(ev).toEqual([
      { seat: 1, event: 'pegarse' },
      { seat: 1, event: 'capicua' },
      { seat: 0, event: 'perder_mano' },
      { seat: 1, event: 'ganar_mano' },
      { seat: 2, event: 'perder_mano' },
      { seat: 3, event: 'ganar_mano' },
    ]);
  });

  it('tranque: reacciona el que trancó; fin de partida', () => {
    const ev = detectEvents({
      action: 'pass',
      actor: 3,
      result: { type: 'tranque' },
      lastMover: 2,
      outcome: { winnerTeam: 0, points: 20 },
      matchWinner: 0,
    });
    expect(ev).toContainEqual({ seat: 2, event: 'tranque' });
    expect(ev).toContainEqual({ seat: 0, event: 'ganar_partida' });
    expect(ev).toContainEqual({ seat: 1, event: 'perder_partida' });
    expect(ev.some((e) => e.event === 'ganar_mano')).toBe(false);
  });

  it('tranque empatado no genera ganar/perder', () => {
    const ev = detectEvents({
      action: 'pass',
      actor: 3,
      result: { type: 'tranque' },
      lastMover: 0,
      outcome: { winnerTeam: null, points: 0 },
    });
    expect(ev.map((e) => e.event)).toEqual(['pasar', 'tranque']);
  });
});

describe('findReaction / isReactionEvent', () => {
  it('busca la reacción configurada para un evento', () => {
    const list = [{ event: 'pegarse' as const, gesture: 'celebrar', phrase: '¡Me pegué!' }];
    expect(findReaction(list, 'pegarse')?.phrase).toBe('¡Me pegué!');
    expect(findReaction(list, 'pasar')).toBeUndefined();
    expect(isReactionEvent('capicua')).toBe(true);
    expect(isReactionEvent('otra')).toBe(false);
  });
});
