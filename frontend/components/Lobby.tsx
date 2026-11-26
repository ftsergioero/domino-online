'use client';

import { useState } from 'react';
import type { RoomView } from '@/lib/types';

export function Lobby({
  room,
  onStart,
  onLeave,
  onMove,
}: {
  room: RoomView;
  onStart: () => void;
  onLeave: () => void;
  onMove: (playerId: string, seat: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const isHost = room.hostId === room.you;
  const n = room.players.length;

  const link = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}?sala=${room.code}` : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* el portapapeles puede no estar disponible */
    }
  };

  return (
    <main className="lobby">
      <section className="card">
        <p className="muted">Código de la sala</p>
        <div className="room-code">{room.code}</div>
        <div className="row center">
          <button className="btn small" onClick={copy}>
            {copied ? '¡Enlace copiado!' : 'Copiar enlace de invitación'}
          </button>
        </div>
        <p className="muted small">Se juega a {room.targetScore} puntos.</p>
      </section>

      <section className="card">
        <h2>Jugadores ({n}/4)</h2>
        <ol className="players">
          {room.players.map((p, i) => (
            <li key={p.id} className={p.id === room.you ? 'me' : ''}>
              <span className={`dot ${p.connected ? 'on' : ''}`} />
              <span className="pname">
                {p.name}
                {p.id === room.hostId && <em> · anfitrión</em>}
                {p.id === room.you && <em> · tú</em>}
              </span>
              {n === 4 && <span className={`team t${i % 2}`}>Pareja {i % 2 === 0 ? 'A' : 'B'}</span>}
              {isHost && n > 1 && (
                <span className="seat-btns">
                  <button className="btn tiny" disabled={i === 0} onClick={() => onMove(p.id, i - 1)} aria-label="Subir">
                    ▲
                  </button>
                  <button className="btn tiny" disabled={i === n - 1} onClick={() => onMove(p.id, i + 1)} aria-label="Bajar">
                    ▼
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
        {n === 4 && <p className="muted small">Los puestos 1 y 3 forman la pareja A; los puestos 2 y 4, la pareja B.</p>}
        {n < 2 && <p className="muted">Esperando a que se una al menos otro jugador…</p>}

        <div className="row">
          <button className="btn" onClick={onLeave}>
            Salir
          </button>
          {isHost ? (
            <button className="btn primary" disabled={n < 2} onClick={onStart}>
              Empezar partida
            </button>
          ) : (
            <span className="muted">El anfitrión empezará la partida.</span>
          )}
        </div>
      </section>
    </main>
  );
}
