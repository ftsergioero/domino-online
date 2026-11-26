'use client';

import { useEffect, useState } from 'react';
import type { GameView, RoomView, Side } from '@/lib/types';
import { Domino, TileBack } from './Domino';

const POSITIONS: Record<number, string[]> = {
  2: ['bottom', 'top'],
  3: ['bottom', 'right', 'left'],
  4: ['bottom', 'right', 'top', 'left'],
};

export function sideName(g: GameView, side: number) {
  if (g.mode === 'individual') return g.seats[side].name;
  const names = g.seats.filter((s) => s.side === side).map((s) => s.name);
  return `Pareja ${side === 0 ? 'A' : 'B'} (${names.join(' y ')})`;
}

export function Table({
  room,
  onPlay,
  onDraw,
  onNextRound,
  onLobby,
  onLeave,
}: {
  room: RoomView;
  onPlay: (tileIndex: number, side: Side) => void;
  onDraw: () => void;
  onNextRound: () => void;
  onLobby: () => void;
  onLeave: () => void;
}) {
  const g = room.game!;
  const n = g.seats.length;
  const me = g.seat;
  const myTurn = g.phase === 'playing' && g.turn === me;
  const [selected, setSelected] = useState<number | null>(null);

  // Al cambiar el estado, la selección deja de ser válida.
  useEffect(() => setSelected(null), [g.turn, g.round, g.board.length, g.hand.length]);

  const moveFor = (i: number) => g.moves.find((m) => m.tileIndex === i);

  const clickTile = (i: number) => {
    const m = moveFor(i);
    if (!myTurn || !m) return;
    if (g.board.length === 0 || m.sides.length === 1) {
      onPlay(i, m.sides[0]);
    } else {
      setSelected(selected === i ? null : i);
    }
  };

  const connected = (id: string) => room.players.find((p) => p.id === id)?.connected ?? false;
  const lastPlay = [...g.log].reverse().find((l) => l.action === 'play');
  const newestIndex = lastPlay ? (lastPlay.side === 'left' ? 0 : g.board.length - 1) : -1;
  const selMove = selected !== null ? moveFor(selected) : undefined;

  const opponents = Array.from({ length: n - 1 }, (_, k) => (me + k + 1) % n);

  return (
    <main className="table-wrap">
      <header className="scorebar">
        <div className="scores">
          {g.scores.map((s, side) => (
            <div key={side} className={`score t${side}`}>
              <span className="sname">{sideName(g, side)}</span>
              <strong>{s}</strong>
            </div>
          ))}
        </div>
        <div className="meta">
          <span>
            Mano {g.round} · a {g.targetScore}
          </span>
          <span>
            Sala <b>{room.code}</b>
          </span>
          <button className="btn tiny" onClick={onLeave}>
            Salir
          </button>
        </div>
      </header>

      <div className={`felt n${n}`}>
        {opponents.map((seat, k) => {
          const s = g.seats[seat];
          const pos = POSITIONS[n][k + 1];
          const vertical = pos === 'left' || pos === 'right';
          return (
            <div key={s.id} className={`opponent ${pos} ${g.turn === seat && g.phase === 'playing' ? 'turn' : ''}`}>
              <div className="oname">
                <span className={`dot ${connected(s.id) ? 'on' : ''}`} />
                {s.name}
                {g.mode === 'teams' && s.side === g.seats[me]?.side && <em> · compañero</em>}
              </div>
              <div className={`backs ${vertical ? 'col' : ''}`}>
                {Array.from({ length: s.tiles }, (_, i) => (
                  <TileBack key={i} horizontal={vertical} />
                ))}
              </div>
              <div className="count">{s.tiles} fichas</div>
            </div>
          );
        })}

        <div className="board-area">
          {g.board.length === 0 ? (
            <div className="board-empty">
              {g.requiredOpening ? (
                <>
                  {g.seats[g.turn].name} abre con el{' '}
                  <Domino a={g.requiredOpening[0]} b={g.requiredOpening[1]} size="sm" />
                </>
              ) : (
                <>Sale {g.seats[g.turn].name}</>
              )}
            </div>
          ) : (
            <div className="board">
              {selMove?.sides.includes('left') && (
                <button className="end-btn" onClick={() => onPlay(selected!, 'left')}>
                  ◀ Aquí
                </button>
              )}
              {g.board.map((t, i) => (
                <Domino
                  key={`${i}-${t.a}-${t.b}-${g.board.length}`}
                  a={t.a}
                  b={t.b}
                  horizontal={t.a !== t.b}
                  size="sm"
                  state={i === newestIndex ? 'new' : undefined}
                />
              ))}
              {selMove?.sides.includes('right') && (
                <button className="end-btn" onClick={() => onPlay(selected!, 'right')}>
                  Aquí ▶
                </button>
              )}
            </div>
          )}
          {g.mode === 'individual' && <div className="boneyard">Pozo: {g.boneyardCount} fichas</div>}
        </div>
      </div>

      <section className={`me-area ${myTurn ? 'turn' : ''}`}>
        <div className="status">
          {g.phase === 'playing' &&
            (myTurn ? (
              g.canDraw ? (
                <>
                  <span>No tienes jugada.</span>
                  <button className="btn primary" onClick={onDraw}>
                    Robar del pozo
                  </button>
                </>
              ) : selMove ? (
                <span>Elige en qué extremo colocarla.</span>
              ) : (
                <span>
                  <b>¡Tu turno!</b> Toca una ficha resaltada.
                </span>
              )
            ) : (
              <span>Turno de {g.seats[g.turn].name}…</span>
            ))}
        </div>
        <div className="hand">
          {g.hand.map((t, i) => {
            const playable = myTurn && !!moveFor(i);
            return (
              <Domino
                key={`${t[0]}-${t[1]}`}
                a={t[0]}
                b={t[1]}
                size="lg"
                state={selected === i ? 'selected' : playable ? 'playable' : myTurn ? 'dim' : undefined}
                onClick={playable ? () => clickTile(i) : undefined}
              />
            );
          })}
        </div>
        <Log g={g} />
      </section>

      {g.phase !== 'playing' && g.lastResult && (
        <RoundModal
          g={g}
          isHost={room.hostId === room.you}
          onNextRound={onNextRound}
          onLobby={onLobby}
        />
      )}
    </main>
  );
}

function Log({ g }: { g: GameView }) {
  if (g.log.length === 0) return null;
  return (
    <ul className="log">
      {g.log
        .slice(-4)
        .reverse()
        .map((l, i) => (
          <li key={i}>
            <b>{g.seats[l.player].name}</b>{' '}
            {l.action === 'play' && l.tile ? (
              <>
                jugó {l.tile[0]}|{l.tile[1]}
              </>
            ) : l.action === 'draw' ? (
              'robó del pozo'
            ) : (
              'pasó'
            )}
          </li>
        ))}
    </ul>
  );
}

function RoundModal({
  g,
  isHost,
  onNextRound,
  onLobby,
}: {
  g: GameView;
  isHost: boolean;
  onNextRound: () => void;
  onLobby: () => void;
}) {
  const r = g.lastResult!;
  const over = g.phase === 'gameOver';
  const mySide = g.seats[g.seat]?.side;
  const won = over && g.winnerSide === mySide;

  return (
    <div className="modal-bg">
      <div className="modal">
        {over ? (
          <h2>{won ? (g.mode === 'teams' ? '🏆 ¡Ganaron la partida!' : '🏆 ¡Ganaste la partida!') : 'Fin de la partida'}</h2>
        ) : (
          <h2>{r.reason === 'domino' ? '¡Dominó!' : '¡Tranque!'}</h2>
        )}
        <p>
          {r.reason === 'domino'
            ? `${g.seats[r.winnerPlayer!].name} se quedó sin fichas.`
            : 'Nadie puede jugar: gana quien tiene menos puntos.'}{' '}
          {r.winnerSide !== null ? (
            <>
              <b>{sideName(g, r.winnerSide)}</b> suma <b>{r.points}</b> puntos.
            </>
          ) : (
            'Empate: nadie suma puntos.'
          )}
        </p>
        {over && g.winnerSide !== null && (
          <p className="winner">
            Ganador: <b>{sideName(g, g.winnerSide)}</b>
          </p>
        )}

        <table className="results">
          <tbody>
            {g.seats.map((s, i) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>
                  <div className="hand-small">
                    {r.hands[i].length === 0 ? (
                      <em>sin fichas</em>
                    ) : (
                      r.hands[i].map((t, j) => <Domino key={j} a={t[0]} b={t[1]} size="sm" horizontal />)
                    )}
                  </div>
                </td>
                <td className="num">{r.handPoints[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="totals">
          {g.scores.map((s, side) => (
            <div key={side}>
              {sideName(g, side)}: <b>{s}</b>
            </div>
          ))}
        </div>

        <div className="row center">
          {over ? (
            isHost ? (
              <button className="btn primary" onClick={onLobby}>
                Volver a la sala
              </button>
            ) : (
              <span className="muted">Esperando al anfitrión…</span>
            )
          ) : (
            <button className="btn primary" onClick={onNextRound}>
              Siguiente mano
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
