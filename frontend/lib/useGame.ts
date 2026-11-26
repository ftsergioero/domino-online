'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Ack, RoomView } from './types';

const SESSION_KEY = 'domino-session';

interface Session {
  code: string;
  playerId: string;
  name: string;
}

function serverUrl() {
  if (process.env.NEXT_PUBLIC_SERVER_URL) return process.env.NEXT_PUBLIC_SERVER_URL;
  return `${window.location.protocol}//${window.location.hostname}:3001`;
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

export function savedName(): string {
  try {
    return localStorage.getItem('domino-name') ?? '';
  } catch {
    return '';
  }
}

export function useGame() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    const socket = io(serverUrl(), { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      const s = loadSession();
      if (!s) {
        setRestoring(false);
        return;
      }
      // Reconexión automática a la sala en la que estábamos.
      socket.emit('room:join', { code: s.code, playerId: s.playerId, name: s.name }, (ack: Ack) => {
        if (!ack.ok) {
          saveSession(null);
          setRoom(null);
        }
        setRestoring(false);
      });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => {
      setConnected(false);
      setRestoring(false);
    });
    socket.on('room:state', (state: RoomView) => setRoom(state));

    return () => {
      socket.close();
    };
  }, []);

  const emit = useCallback((event: string, body?: unknown) => {
    return new Promise<Ack>((resolve) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        const ack: Ack = { ok: false, error: 'Sin conexión con el servidor' };
        setError(ack.error);
        return resolve(ack);
      }
      socket.timeout(8000).emit(event, body ?? {}, (err: Error | null, ack: Ack) => {
        const result: Ack = err ? { ok: false, error: 'El servidor no responde' } : ack;
        setError(result.ok ? null : result.error);
        resolve(result);
      });
    });
  }, []);

  const enter = useCallback(
    async (event: 'room:create' | 'room:join', body: Record<string, unknown>, name: string) => {
      const ack = await emit(event, body);
      if (ack.ok && ack.code && ack.playerId) {
        saveSession({ code: ack.code, playerId: ack.playerId, name });
        try {
          localStorage.setItem('domino-name', name);
        } catch {
          /* nada */
        }
        const url = new URL(window.location.href);
        url.searchParams.set('sala', ack.code);
        window.history.replaceState(null, '', url);
      }
      return ack;
    },
    [emit],
  );

  const actions = {
    create: (name: string, targetScore: number) => enter('room:create', { name, targetScore }, name),
    join: (code: string, name: string) => enter('room:join', { code, name }, name),
    leave: async () => {
      await emit('room:leave');
      saveSession(null);
      setRoom(null);
      const url = new URL(window.location.href);
      url.searchParams.delete('sala');
      window.history.replaceState(null, '', url);
    },
    start: () => emit('game:start'),
    move: (playerId: string, seat: number) => emit('room:move', { playerId, seat }),
    play: (tileIndex: number, side: 'left' | 'right') => emit('game:play', { tileIndex, side }),
    draw: () => emit('game:draw'),
    nextRound: () => emit('game:nextRound'),
    lobby: () => emit('game:lobby'),
    clearError: () => setError(null),
  };

  return { connected, room, error, restoring, actions };
}
