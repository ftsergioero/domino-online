'use client';
import { useEffect, useState } from 'react';
import { Bubble, Side, TableView, Tile } from '@/lib/types';
import { AvatarView, Mood } from './Avatar';
import { TileView } from './Tile';

const same = (a: Tile, b: Tile) => a[0] === b[0] && a[1] === b[1];
const teamLabel = (t: 0 | 1) => (t === 0 ? 'A' : 'B');
const POS = ['bottom', 'right', 'top', 'left'] as const;

export function TableBoard({
  state,
  bubbles,
  log,
  onPlay,
  onPass,
  onSay,
  onLeave,
  onRematch,
}: {
  state: TableView;
  bubbles: Bubble[];
  log: string[];
  onPlay: (tile: Tile, side: Side) => void;
  onPass: () => void;
  onSay: (text: string) => void;
  onLeave: () => void;
  onRematch: () => void;
}) {
  const [choosing, setChoosing] = useState<Tile | null>(null);
  const [phrase, setPhrase] = useState('');
  const me = state.mySeat ?? 0;
  const myTurn = state.status === 'playing' && state.turn === me;
  useEffect(() => setChoosing(null), [state.turn, state.handNumber]);

  const sidesFor = (t: Tile) => state.playable.filter((m) => same(m.tile, t)).map((m) => m.side);

  function clickTile(t: Tile) {
    const sides = sidesFor(t);
    if (!sides.length) return;
    const ambiguous = sides.length === 2 && state.ends && state.ends[0] !== state.ends[1];
    if (ambiguous) setChoosing(t);
    else onPlay(t, sides[0]);
  }

  const myTeam = (me % 2) as 0 | 1;

  return (
    <div className="table-layout">
      <header className="table-header">
        <div>
          Mesa <strong className="code">{state.id}</strong>
          <button className="link" onClick={() => navigator.clipboard?.writeText(state.id)} title="Copiar código">
            copiar
          </button>
        </div>
        <div className="score">
          <span className={myTeam === 0 ? 'mine' : ''}>Pareja A {state.score[0]}</span>
          <span>–</span>
          <span className={myTeam === 1 ? 'mine' : ''}>{state.score[1]} Pareja B</span>
          <small>a {state.rules.target}</small>
        </div>
        <div>
          {state.handNumber > 0 && <span>Mano {state.handNumber}</span>}
          <button className="link" onClick={onLeave}>
            salir
          </button>
        </div>
      </header>

      <div className="felt">
        {[0, 1, 2, 3].map((offset) => {
          const seat = (me + offset) % 4;
          const s = state.seats[seat];
          const bubble = bubbles.find((b) => b.seat === seat);
          const mood: Mood = !s?.connected ? 'desconectado' : state.turn === seat ? 'pensando' : 'esperando';
          return (
            <div key={seat} className={`seat seat-${POS[offset]} ${state.turn === seat ? 'active' : ''}`}>
              {s ? (
                <>
                  <AvatarView avatar={s.avatar} mood={mood} gesture={bubble?.gesture} />
                  <div className="seat-name">
                    {s.name} {offset === 0 && '(tú)'}
                    <small>
                      Pareja {teamLabel((seat % 2) as 0 | 1)} {s.connected ? '' : '· desconectado'}
                    </small>
                  </div>
                  {offset !== 0 && state.status !== 'waiting' && (
                    <div className="backs">
                      {Array.from({ length: s.tiles }, (_, i) => (
                        <TileView key={i} hidden size={0.3} />
                      ))}
                    </div>
                  )}
                  {bubble && <div className="bubble">{bubble.text}</div>}
                </>
              ) : (
                <div className="seat-empty">Asiento {seat + 1} libre</div>
              )}
            </div>
          );
        })}

        <div className="chain-area">
          {state.status === 'waiting' && (
            <p className="hint">
              Esperando jugadores ({state.seats.filter(Boolean).length}/4). Comparte el código <b>{state.id}</b>.
            </p>
          )}
          {state.status === 'playing' && state.chain.length === 0 && (
            <p className="hint">{myTurn ? 'Sales tú: juega cualquier ficha' : `Sale ${state.seats[state.turn!]?.name}`}</p>
          )}
          {choosing && (
            <div className="side-picker">
              <button onClick={() => onPlay(choosing, 'left')}>◀ Por el {state.ends?.[0]}</button>
              <button onClick={() => onPlay(choosing, 'right')}>Por el {state.ends?.[1]} ▶</button>
            </div>
          )}
          <div className="chain">
            {state.chain.map((t, i) => (
              <TileView key={i} tile={t} horizontal={t[0] !== t[1]} size={0.55} />
            ))}
          </div>
          {state.status === 'hand_over' && state.lastHand && <HandSummary state={state} />}
          {state.status === 'finished' && (
            <div className="result">
              <h2>¡Partida para la pareja {teamLabel(state.matchWinner!)}!</h2>
              <p>
                {state.score[0]} – {state.score[1]}
              </p>
              {state.lastHand && <HandSummary state={state} />}
              <button className="primary" onClick={onRematch}>
                Revancha
              </button>
            </div>
          )}
        </div>
      </div>

      <section className="my-hand">
        <div className="turn-info">
          {state.status === 'playing' && (myTurn ? <b>Tu turno</b> : <span>Turno de {state.seats[state.turn!]?.name}</span>)}
          {state.canPass && (
            <button className="primary" onClick={onPass}>
              Pasar
            </button>
          )}
        </div>
        <div className="hand">
          {state.hand.map((t) => {
            const playable = sidesFor(t).length > 0;
            return (
              <TileView
                key={`${t[0]}-${t[1]}`}
                tile={t}
                size={0.9}
                className={`${playable ? 'playable' : myTurn ? 'dim' : ''} ${choosing && same(choosing, t) ? 'selected' : ''}`}
                onClick={playable ? () => clickTile(t) : undefined}
              />
            );
          })}
        </div>
      </section>

      <aside className="side-panel">
        <form
          className="say"
          onSubmit={(e) => {
            e.preventDefault();
            if (phrase.trim()) onSay(phrase.trim());
            setPhrase('');
          }}
        >
          <input placeholder="Di algo a la mesa…" value={phrase} maxLength={120} onChange={(e) => setPhrase(e.target.value)} />
        </form>
        <div className="quick">
          {['¡Data!', '¡Agua!', 'Ahí te va', '¡Qué clase de mano!'].map((q) => (
            <button key={q} onClick={() => onSay(q)}>
              {q}
            </button>
          ))}
        </div>
        <ul className="log">
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function HandSummary({ state }: { state: TableView }) {
  const lh = state.lastHand!;
  const title =
    lh.result.type === 'pegado'
      ? `${state.seats[lh.result.player]?.name} se pegó${lh.result.capicua ? ' con capicúa' : ''}`
      : 'Tranque';
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = state.nextHandAt ? Math.max(0, Math.ceil((state.nextHandAt - now) / 1000)) : null;
  return (
    <div className="summary">
      <h3>{title}</h3>
      <p>
        {lh.outcome.winnerTeam === null
          ? 'Empate: nadie anota.'
          : `Pareja ${teamLabel(lh.outcome.winnerTeam)} anota ${lh.outcome.points} puntos.`}
      </p>
      <table>
        <tbody>
          {lh.hands.map((h, i) => (
            <tr key={i}>
              <td>{state.seats[i]?.name}</td>
              <td className="mini-hand">
                {h.map((t, j) => (
                  <TileView key={j} tile={t} size={0.35} />
                ))}
              </td>
              <td>{lh.totals[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {left !== null && state.status === 'hand_over' && <p className="hint">Siguiente mano en {left}s…</p>}
    </div>
  );
}
