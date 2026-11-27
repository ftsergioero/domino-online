'use client';

import { useEffect } from 'react';
import { Home } from '@/components/Home';
import { Lobby } from '@/components/Lobby';
import { Table } from '@/components/Table';
import { useGame } from '@/lib/useGame';

export default function Page() {
  const { connected, room, error, restoring, actions } = useGame();

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(actions.clearError, 3500);
    return () => clearTimeout(t);
  }, [error]); // eslint-disable-line react-hooks/exhaustive-deps

  let view;
  if (restoring && !room) {
    view = <main className="home"><p className="muted">Conectando…</p></main>;
  } else if (!room) {
    view = <Home connected={connected} onCreate={actions.create} onJoin={actions.join} />;
  } else if (!room.game) {
    view = <Lobby room={room} onStart={actions.start} onLeave={actions.leave} onMove={actions.move} />;
  } else {
    view = (
      <Table
        room={room}
        onPlay={actions.play}
        onDraw={actions.draw}
        onPick={actions.pick}
        onRequestStart={actions.requestStart}
        onRespondStart={actions.respondStart}
        onNextRound={actions.nextRound}
        onLobby={actions.lobby}
        onLeave={actions.leave}
      />
    );
  }

  return (
    <>
      {room && !connected && <div className="banner">Conexión perdida. Reconectando…</div>}
      {error && (
        <div className="toast" role="alert" onClick={actions.clearError}>
          {error}
        </div>
      )}
      {view}
    </>
  );
}
