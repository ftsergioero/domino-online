process.env.HAND_PAUSE_MS = '0';
if (process.env.E2E_USE_INFRA !== '1') {
  delete process.env.REDIS_URL;
  delete process.env.DB_HOST;
}

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { Socket, io } from 'socket.io-client';
import { AppModule } from '../src/app.module';

type View = any;

class Bot {
  socket: Socket;
  state: View | null = null;
  reactions: any[] = [];
  events: string[] = [];
  matchEnd: any = null;

  constructor(url: string, public playerId: string, public name: string) {
    this.socket = io(url, { auth: { playerId, name }, transports: ['websocket'], forceNew: true });
    this.socket.on('game:state', (s) => {
      this.state = s;
      this.maybeAct();
    });
    for (const ev of ['game:turn', 'game:pegado', 'game:tranque', 'hand:score']) this.socket.on(ev, () => this.events.push(ev));
    this.socket.on('reaction', (r) => this.reactions.push(r));
    this.socket.on('match:end', (m) => (this.matchEnd = m));
  }

  emit(ev: string, body?: object): Promise<any> {
    return new Promise((res) => this.socket.emit(ev, body ?? {}, res));
  }

  private acting = false;
  private async maybeAct() {
    const s = this.state;
    if (!s || this.acting || s.status !== 'playing' || s.turn !== s.mySeat) return;
    this.acting = true;
    const move = s.playable[0];
    const ack = move ? await this.emit('game:play', move) : await this.emit('game:pass');
    this.acting = false;
    if (!ack.ok) throw new Error(`${this.name}: ${ack.error}`);
  }
}

const connected = (s: Socket) => new Promise<void>((r) => s.on('connect', () => r()));

const waitFor = async (cond: () => boolean, ms = 20000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('TablesGateway (e2e)', () => {
  let app: INestApplication;
  let url: string;
  const bots: Bot[] = [];

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.listen(0);
    url = `http://localhost:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    bots.forEach((b) => b.socket.disconnect());
    await app.close();
  });

  it('rechaza conexiones sin playerId válido', async () => {
    const s = io(url, { auth: { playerId: 'x' }, transports: ['websocket'], forceNew: true });
    await new Promise<void>((res) => s.on('disconnect', () => res()));
  });

  it('juega una partida completa de 4 jugadores', async () => {
    const id = (n: number) => `e2e-player-${n}-${Date.now()}`;
    for (let i = 0; i < 4; i++) bots.push(new Bot(url, id(i), `Bot ${i}`));
    await Promise.all(bots.map((b) => connected(b.socket)));

    const created = await bots[0].emit('table:create', { rules: { target: 30 } });
    expect(created).toMatchObject({ ok: true, seat: 0 });
    const tableId = created.tableId;

    expect(await bots[1].emit('table:join', { tableId: 'NOPE1' })).toEqual({ ok: false, error: 'La mesa no existe' });
    expect(await bots[1].emit('table:join', { tableId, seat: 0 })).toEqual({ ok: false, error: 'Ese asiento está ocupado' });
    expect(await bots[1].emit('game:pass')).toEqual({ ok: false, error: 'No estás en ninguna mesa' });

    // El jugador 3 se sienta en el asiento 2 para comprobar la asignación explícita.
    expect(await bots[1].emit('table:join', { tableId: tableId.toLowerCase() })).toMatchObject({ ok: true, seat: 1 });
    expect(await bots[3].emit('table:join', { tableId, seat: 2 })).toMatchObject({ ok: true, seat: 2 });
    expect(await bots[2].emit('table:join', { tableId })).toMatchObject({ ok: true, seat: 3 });

    const intruder = new Bot(url, id(9), 'Intruso');
    await connected(intruder.socket);
    expect(await intruder.emit('table:join', { tableId })).toEqual({ ok: false, error: 'La partida ya empezó' });
    intruder.socket.disconnect();

    // Cada cliente solo ve su mano.
    await waitFor(() => bots.every((b) => b.state?.status === 'playing'));
    for (const b of bots) {
      expect(b.state.hand.length).toBe(b.state.seats[b.state.mySeat].tiles);
      expect(JSON.stringify(b.state)).not.toContain('playerId');
      expect(b.state).not.toHaveProperty('hands');
    }

    await waitFor(() => bots.every((b) => b.matchEnd), 60000);
    const end = bots[0].matchEnd;
    expect(Math.max(...end.score)).toBeGreaterThanOrEqual(30);
    expect(bots.every((b) => b.state.status === 'finished')).toBe(true);
    expect(bots[0].events).toContain('hand:score');
    expect(bots[0].events.some((e) => e === 'game:pegado' || e === 'game:tranque')).toBe(true);
    // Reacciones por defecto: ganar la partida siempre emite reacción.
    // (las reacciones llegan justo después de match:end: se busca cada una en el perfil)
    await waitFor(() => bots[0].reactions.filter((r) => r.event === 'ganar_partida').length === 2, 5000);

    // El historial queda guardado.
    const hist = await fetch(`${url}/profiles/${bots[0].playerId}/history`).then((r) => r.json() as any);
    expect(hist[0]).toMatchObject({ tableId, score: end.score });
  }, 90000);

  it('reconecta a un jugador a su asiento y le reenvía su mano', async () => {
    const created = await bots[0].emit('table:rematch');
    expect(created.ok).toBe(true);
    await waitFor(() => bots.every((b) => b.state?.status === 'playing' && b.state.handNumber === 1));

    const old = bots[2];
    const seat = old.state.mySeat;
    const hand = old.state.hand;
    old.socket.disconnect();
    // El resto ve el asiento desconectado (salvo que la mano haya acabado entretanto).
    await waitFor(() => bots[0].state.seats[seat].connected === false);

    const again = new Bot(url, old.playerId, old.name);
    bots[2] = again;
    await connected(again.socket);
    const ack = await again.emit('table:resume');
    expect(ack).toMatchObject({ ok: true, seat, rejoined: true });
    await waitFor(() => !!again.state);
    if (again.state.handNumber === 1 && again.state.status === 'playing') {
      expect(again.state.hand.length).toBeLessThanOrEqual(hand.length);
    }
    expect(bots[0].state.seats[seat].connected).toBe(true);
  }, 30000);

  it('perfiles: lee y actualiza reacciones, valida la entrada', async () => {
    const pid = bots[0].playerId;
    const p = await fetch(`${url}/profiles/${pid}`).then((r) => r.json() as any);
    expect(p.reactions.length).toBeGreaterThan(0);
    const put = (body: object) =>
      fetch(`${url}/profiles/${pid}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const ok = await put({ reactions: [{ event: 'pasar', gesture: 'llorar', phrase: 'No llevo' }] });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as any).reactions).toEqual([{ event: 'pasar', gesture: 'llorar', phrase: 'No llevo' }]);
    expect((await put({ reactions: [{ event: 'volar', gesture: 'x', phrase: '' }] })).status).toBe(400);
  });

  it('chat:phrase llega a toda la mesa', async () => {
    const got = new Promise((r) => bots[1].socket.once('chat:phrase', r));
    expect(await bots[0].emit('chat:phrase', { text: '¡Data!' })).toEqual({ ok: true });
    expect(await got).toMatchObject({ seat: 0, text: '¡Data!' });
  });
});
