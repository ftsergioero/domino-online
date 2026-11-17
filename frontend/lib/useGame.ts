'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Socket, io } from 'socket.io-client';
import { Ack, Bubble, Rules, Side, TableView, Tile } from './types';

export const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:4000';

/**
 * Cada pestaña es un jugador distinto (sessionStorage), así se puede probar
 * una partida de 4 abriendo 4 pestañas. Recargar la pestaña reconecta al mismo asiento.
 */
export function getPlayerId(): string {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('player');
  if (fromUrl && /^[A-Za-z0-9_-]{8,64}$/.test(fromUrl)) return fromUrl;
  let id = sessionStorage.getItem('domino:playerId');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('domino:playerId', id);
  }
  return id;
}

export function useGame(name: string | null) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<TableView | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef<TableView | null>(null);
  stateRef.current = state;

  const addLog = useCallback((m: string) => setLog((l) => [m, ...l].slice(0, 30)), []);
  const showBubble = useCallback((b: Omit<Bubble, 'id'>) => {
    const id = Math.random();
    setBubbles((list) => [...list.filter((x) => x.seat !== b.seat), { ...b, id }]);
    setTimeout(() => setBubbles((list) => list.filter((x) => x.id !== id)), 3500);
  }, []);

  useEffect(() => {
    if (!name) return;
    const playerId = getPlayerId();
    const socket = io(SERVER_URL, { auth: { playerId, name }, transports: ['websocket'] });
    socketRef.current = socket;
    const seatName = (seat: number) => stateRef.current?.seats[seat]?.name ?? `Jugador ${seat + 1}`;

    socket.on('connect', () => {
      setConnected(true);
      // Reconexión: si estaba sentado en una mesa, volver a ella.
      socket.emit('table:resume', {}, (ack: Ack<{ tableId: string | null }>) => {
        if (ack.ok && ack.tableId) addLog(`Reconectado a la mesa ${ack.tableId}`);
      });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('error:fatal', (e: { error: string }) => setError(e.error));
    socket.on('game:state', (s: TableView) => setState(s));
    socket.on('game:pegado', (e: { seat: number; capicua: boolean }) =>
      addLog(`${seatName(e.seat)} se pegó${e.capicua ? ' ¡con capicúa!' : ''}`),
    );
    socket.on('game:tranque', () => addLog('¡Tranque!'));
    socket.on('hand:score', (e: { winnerTeam: 0 | 1 | null; points: number; score: [number, number] }) =>
      addLog(
        e.winnerTeam === null
          ? 'Mano empatada: nadie anota'
          : `Pareja ${e.winnerTeam === 0 ? 'A' : 'B'} anota ${e.points} (${e.score[0]} - ${e.score[1]})`,
      ),
    );
    socket.on('match:end', (e: { winnerTeam: 0 | 1 }) => addLog(`¡Partida para la pareja ${e.winnerTeam === 0 ? 'A' : 'B'}!`));
    socket.on('reaction', (r: { seat: number; phrase: string; gesture: string }) =>
      showBubble({ seat: r.seat, text: r.phrase, gesture: r.gesture }),
    );
    socket.on('chat:phrase', (c: { seat: number | null; text: string; gesture?: string }) => {
      if (c.seat !== null) showBubble({ seat: c.seat, text: c.text, gesture: c.gesture });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [name, addLog, showBubble]);

  const emit = useCallback(<T,>(event: string, body: object = {}) => {
    return new Promise<Ack<T>>((resolve) => {
      const s = socketRef.current;
      if (!s) return resolve({ ok: false, error: 'Sin conexión' });
      s.timeout(5000).emit(event, body, (err: Error | null, ack: Ack<T>) => {
        const res: Ack<T> = err ? { ok: false, error: 'El servidor no responde' } : ack;
        if (!res.ok) setError(res.error);
        else setError(null);
        resolve(res);
      });
    });
  }, []);

  return {
    connected,
    state,
    bubbles,
    log,
    error,
    clearError: () => setError(null),
    create: (rules: Partial<Rules>) => emit<{ tableId: string; seat: number }>('table:create', { rules }),
    join: (tableId: string, seat?: number) => emit<{ seat: number }>('table:join', { tableId, seat }),
    leave: async () => {
      const r = await emit('table:leave');
      if (r.ok) setState(null);
    },
    play: (tile: Tile, side: Side) => emit('game:play', { tile, side }),
    pass: () => emit('game:pass'),
    say: (text: string, gesture?: string) => emit('chat:phrase', { text, gesture }),
    rematch: () => emit('table:rematch'),
  };
}
