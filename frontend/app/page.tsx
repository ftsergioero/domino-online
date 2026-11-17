'use client';
import { useEffect, useState } from 'react';
import { Lobby } from '@/components/Lobby';
import { ProfileEditor } from '@/components/ProfileEditor';
import { TableBoard } from '@/components/TableBoard';
import { useGame } from '@/lib/useGame';

export default function Home() {
  const [name, setName] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const game = useGame(name);

  useEffect(() => {
    // El nombre es por pestaña para poder probar con 4 pestañas; se sugiere el último usado.
    const saved = sessionStorage.getItem('domino:name');
    if (saved) setName(saved);
    else setDraft(localStorage.getItem('domino:lastName') ?? '');
  }, []);

  if (!name) {
    return (
      <main className="center">
        <h1>Dominó cubano</h1>
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            const n = draft.trim().slice(0, 24);
            if (!n) return;
            sessionStorage.setItem('domino:name', n);
            localStorage.setItem('domino:lastName', n);
            setName(n);
          }}
        >
          <label>
            ¿Cómo te llamas?
            <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={24} />
          </label>
          <button className="primary" type="submit">
            Entrar
          </button>
        </form>
      </main>
    );
  }

  return (
    <main>
      <nav className="topbar">
        <h1>Dominó cubano</h1>
        <span className={`status ${game.connected ? 'on' : 'off'}`}>{game.connected ? 'conectado' : 'conectando…'}</span>
        <span>{name}</span>
        <button className="link" onClick={() => setEditing(true)}>
          personaje y reacciones
        </button>
      </nav>
      {game.error && (
        <div className="error" onClick={game.clearError}>
          {game.error}
        </div>
      )}
      {game.state ? (
        <TableBoard
          state={game.state}
          bubbles={game.bubbles}
          log={game.log}
          onPlay={game.play}
          onPass={game.pass}
          onSay={(t) => game.say(t)}
          onLeave={game.leave}
          onRematch={game.rematch}
        />
      ) : (
        <Lobby onCreate={game.create} onJoin={game.join} />
      )}
      {editing && <ProfileEditor name={name} onClose={() => setEditing(false)} />}
    </main>
  );
}
