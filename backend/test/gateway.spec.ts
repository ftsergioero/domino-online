import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';

jest.setTimeout(20000);

type State = any;

function client(url: string) {
  const s = io(url, { transports: ['websocket'], forceNew: true });
  const c = { socket: s, state: null as State, waiters: [] as (() => void)[] };
  s.on('room:state', (st) => {
    c.state = st;
    c.waiters.splice(0).forEach((w) => w());
  });
  return c;
}
const emit = (s: Socket, ev: string, body?: unknown): Promise<any> =>
  new Promise((res) => s.emit(ev, body ?? {}, res));

describe('gateway en tiempo real', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.listen(0);
    url = await app.getUrl();
  });
  afterAll(() => app.close());

  test('4 jugadores crean sala, se unen y juegan una partida entera', async () => {
    const cs = [0, 1, 2, 3].map(() => client(url));
    const created = await emit(cs[0].socket, 'room:create', { name: 'Ana', targetScore: 50 });
    expect(created.ok).toBe(true);
    for (const [i, c] of cs.slice(1).entries()) {
      const r = await emit(c.socket, 'room:join', { code: created.code.toLowerCase(), name: `J${i}` });
      expect(r.ok).toBe(true);
    }
    const full = client(url);
    expect(await emit(full.socket, 'room:join', { code: created.code, name: 'X' })).toEqual({
      ok: false, error: 'La sala está llena',
    });
    full.socket.close();

    expect((await emit(cs[1].socket, 'game:start')).ok).toBe(false); // no es anfitrión
    expect((await emit(cs[0].socket, 'game:start')).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 50));

    // Nadie ve las fichas de los demás.
    for (const c of cs) expect(c.state.game.hand).toHaveLength(7);
    expect(JSON.stringify(cs[0].state)).not.toContain('boneyard"');

    let guard = 0;
    while (cs[0].state.game.phase !== 'gameOver') {
      if (++guard > 2000) throw new Error('no termina');
      const g = cs[0].state.game;
      if (g.phase === 'roundOver') {
        await emit(cs[0].socket, 'game:nextRound');
      } else {
        const c = cs[g.turn];
        const m = c.state.game.moves[0];
        const r = await emit(c.socket, 'game:play', { tileIndex: m.tileIndex, side: m.sides[0] });
        expect(r).toEqual({ ok: true });
      }
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(cs[0].state.game.winnerSide).not.toBeNull();
    expect(cs[0].state.game.lastResult.hands).toHaveLength(4);

    // Reconexión con el mismo id de jugador.
    const pid = cs[2].state.you;
    cs[2].socket.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(cs[0].state.players[2].connected).toBe(false);
    const again = client(url);
    expect((await emit(again.socket, 'room:join', { code: created.code, playerId: pid })).playerId).toBe(pid);
    await new Promise((r) => setTimeout(r, 50));
    expect(cs[0].state.players[2].connected).toBe(true);

    expect((await emit(cs[0].socket, 'game:lobby')).ok).toBe(true);
    [...cs, again].forEach((c) => c.socket.close());
  });
});
