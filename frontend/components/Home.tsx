'use client';

import { useEffect, useState } from 'react';
import { savedName } from '@/lib/useGame';
import type { Ack } from '@/lib/types';
import { Domino } from './Domino';

export function Home({
  connected,
  onCreate,
  onJoin,
}: {
  connected: boolean;
  onCreate: (name: string, target: number) => Promise<Ack>;
  onJoin: (code: string, name: string) => Promise<Ack>;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [target, setTarget] = useState(100);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(savedName());
    const sala = new URLSearchParams(window.location.search).get('sala');
    if (sala) setCode(sala.toUpperCase());
  }, []);

  const run = async (fn: () => Promise<Ack>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  const nameOk = name.trim().length > 0;

  return (
    <main className="home">
      <div className="hero">
        <div className="hero-tiles" aria-hidden>
          <Domino a={6} b={6} size="lg" />
          <Domino a={5} b={3} size="lg" />
          <Domino a={1} b={4} size="lg" />
        </div>
        <h1>Dominó Online</h1>
        <p className="muted">Juega con tus amigos de 2 a 4 jugadores. Con 4, se juega por parejas.</p>
      </div>

      <section className="card">
        <label className="field">
          <span>Tu nombre</span>
          <input
            value={name}
            maxLength={20}
            placeholder="Ej. Sergio"
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>

        <div className="split">
          <div className="panel">
            <h2>Crear sala</h2>
            <label className="field">
              <span>Jugar a</span>
              <select value={target} onChange={(e) => setTarget(Number(e.target.value))}>
                {[50, 100, 150, 200].map((v) => (
                  <option key={v} value={v}>
                    {v} puntos
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn primary"
              disabled={!nameOk || busy || !connected}
              onClick={() => run(() => onCreate(name.trim(), target))}
            >
              Crear sala
            </button>
          </div>

          <div className="panel">
            <h2>Unirse a una sala</h2>
            <label className="field">
              <span>Código</span>
              <input
                value={code}
                maxLength={4}
                placeholder="ABCD"
                className="code-input"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && nameOk && code.length === 4) run(() => onJoin(code, name.trim()));
                }}
              />
            </label>
            <button
              className="btn"
              disabled={!nameOk || code.length !== 4 || busy || !connected}
              onClick={() => run(() => onJoin(code, name.trim()))}
            >
              Unirse
            </button>
          </div>
        </div>
        {!connected && <p className="warn">Conectando con el servidor…</p>}
      </section>

      <details className="card rules">
        <summary>Reglas</summary>
        <ul>
          <li>Se juega con las 28 fichas del doble seis; cada jugador recibe 7.</li>
          <li>Con 4 jugadores se juega por parejas (los compañeros se sientan enfrente) y no hay pozo.</li>
          <li>Con 2 o 3 jugadores las fichas sobrantes forman el pozo: si no puedes jugar, robas.</li>
          <li>La primera mano la abre quien tenga el doble más alto. Las siguientes, el ganador de la anterior.</li>
          <li>Si no puedes jugar ni robar, pasas automáticamente.</li>
          <li>Quien se queda sin fichas gana la mano y su bando suma los puntos de todas las fichas que quedan.</li>
          <li>Si el juego se cierra (tranque), gana el bando con menos puntos en la mano.</li>
        </ul>
      </details>
    </main>
  );
}
