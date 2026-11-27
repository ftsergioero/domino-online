'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameView, RoomView, Side } from '@/lib/types';
import { Domino, TileBack } from './Domino';
import { Hand } from './Hand';

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

/** Nombre corto para el marcador: «Nosotros»/«Ellos» por parejas, o el nombre en individual. */
function shortSideName(g: GameView, side: number) {
  if (g.mode === 'individual') return g.seats[side].name;
  const mine = g.seats[g.seat]?.side;
  if (mine === undefined) return `Pareja ${side === 0 ? 'A' : 'B'}`;
  return side === mine ? 'Nosotros' : 'Ellos';
}

export function Table({
  room,
  onPlay,
  onDraw,
  onPick,
  onRequestStart,
  onRespondStart,
  onNextRound,
  onLobby,
  onLeave,
}: {
  room: RoomView;
  onPlay: (tileIndex: number, side: Side) => void;
  onDraw: () => void;
  onPick: (index: number) => void;
  onRequestStart: () => void;
  onRespondStart: (accept: boolean) => void;
  onNextRound: () => void;
  onLobby: () => void;
  onLeave: () => void;
}) {
  const g = room.game!;
  const n = g.seats.length;
  const me = g.seat;
  const myTurn = g.phase === 'playing' && g.turn === me;
  const [selected, setSelected] = useState<number | null>(null);
  const [showScores, setShowScores] = useState(false);

  // Al cambiar el estado, la selección deja de ser válida.
  useEffect(() => setSelected(null), [g.turn, g.round, g.board.length, g.hand.length]);

  const moveFor = (i: number) => g.moves.find((m) => m.tileIndex === i);

  const ends = g.board.length ? { left: g.board[0].a, right: g.board[g.board.length - 1].b } : null;

  const clickTile = (i: number) => {
    const m = moveFor(i);
    if (!myTurn || !m) return;
    // Si solo cabe en un lado, o los dos extremos son iguales, da igual dónde: se juega directamente.
    if (!ends || m.sides.length === 1 || ends.left === ends.right) {
      onPlay(i, m.sides[0]);
    } else {
      setSelected(selected === i ? null : i);
    }
  };

  // Aviso con vibración (en móviles que lo permitan) cuando empieza tu turno o te toca decidir.
  const needsMe =
    myTurn ||
    (g.phase === 'agreeing' && g.startRequest !== null && g.startRequest !== me && g.seats[me]?.side === g.startSide);
  useEffect(() => {
    if (needsMe) navigator.vibrate?.(120);
  }, [needsMe]);

  const connected = (id: string) => room.players.find((p) => p.id === id)?.connected ?? false;
  const lastPlay = [...g.log].reverse().find((l) => l.action === 'play');
  const newestIndex = lastPlay ? (lastPlay.side === 'left' ? 0 : g.board.length - 1) : -1;
  const selMove = selected !== null ? moveFor(selected) : undefined;

  const passAlerts = usePassAlerts(g);
  const announcement = useRoundAnnouncement(g);

  const opponents = Array.from({ length: n - 1 }, (_, k) => (me + k + 1) % n);

  return (
    <main className="table-wrap">
      {passAlerts.length > 0 && (
        <div className="pass-alerts" role="status">
          {passAlerts.map((a) => (
            <div key={a.id} className="pass-alert">
              <b>{a.name}</b> se pasó pa&apos; la p**ga 🫵
            </div>
          ))}
        </div>
      )}
      <header className="scorebar">
        <div className="scores" onClick={() => setShowScores(true)} role="presentation">
          {g.scores.map((s, side) => (
            <div key={side} className={`score t${side}`} title={sideName(g, side)}>
              <span className="sname">{shortSideName(g, side)}</span>
              <strong>{s}</strong>
            </div>
          ))}
        </div>
        <div className="meta">
          <span className="meta-round">{g.phase === 'picking' ? 'Sorteo' : `Mano ${g.round}`}</span>
          <span className="meta-target">a {g.targetScore}</span>
          <span className="meta-code">
            Sala <b>{room.code}</b>
          </span>
          <button className="btn tiny primary" onClick={() => setShowScores(true)} aria-label="Puntos acumulados">
            {/* En móviles estrechos solo se ve el icono. */}
            📊<span className="label-long"> Puntos</span>
          </button>
          <button className="btn tiny" onClick={onLeave}>
            Salir
          </button>
        </div>
      </header>

      {g.phase === 'picking' && g.pick ? (
        <PickBoard g={g} onPick={onPick} />
      ) : (
      <>
      <div className={`felt n${n}`}>
        {opponents.map((seat, k) => {
          const s = g.seats[seat];
          const pos = POSITIONS[n][k + 1];
          const vertical = pos === 'left' || pos === 'right';
          return (
            <div key={s.id} className={`opponent ${pos} ${g.turn === seat && g.phase === 'playing' ? 'turn' : ''}`}>
              <div className="oname">
                <span className={`dot ${connected(s.id) ? 'on' : ''}`} />
                <span className="oname-text">{s.name}</span>
              </div>
              {g.mode === 'teams' && (
                <div className={`otag t${s.side}`}>{s.side === g.seats[me]?.side ? 'compañero' : 'rival'}</div>
              )}
              <div className={`backs ${vertical ? 'col' : ''}`}>
                {Array.from({ length: s.tiles }, (_, i) => (
                  <TileBack key={i} horizontal={vertical} />
                ))}
              </div>
              <div className="count">
                <b>{s.tiles}</b> fichas
              </div>
            </div>
          );
        })}

        <div className="board-area">
          {g.board.length === 0 ? (
            <div className="board-empty">
              {g.pick && g.pick.winner !== null && <PickSummary g={g} />}
              {g.phase === 'agreeing' ? (
                <StartAgreement g={g} onRequest={onRequestStart} onRespond={onRespondStart} />
              ) : g.turn >= 0 ? (
                <div>Sale {g.seats[g.turn].name}</div>
              ) : null}
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
              ) : selMove && ends ? (
                <div className="side-pick">
                  <button className="btn primary big" onClick={() => onPlay(selected!, 'left')}>
                    ◀ Al {ends.left}
                  </button>
                  <span className="muted-light">¿Dónde?</span>
                  <button className="btn primary big" onClick={() => onPlay(selected!, 'right')}>
                    Al {ends.right} ▶
                  </button>
                </div>
              ) : (
                <span className="your-turn">
                  <b>¡Te toca!</b>
                  <span className="label-hint"> Toca una ficha iluminada</span>
                </span>
              )
            ) : (
              <span className="muted-light">Juega {g.seats[g.turn].name}…</span>
            ))}
          {g.phase === 'agreeing' && <span className="muted-light">Decidiendo quién sale…</span>}
        </div>
        <Hand
          hand={g.hand}
          storageKey={`domino-order-${room.code}-${room.you}-${g.round}`}
          stateOf={(i) => {
            const playable = myTurn && !!moveFor(i);
            return selected === i ? 'selected' : playable ? 'playable' : myTurn ? 'dim' : undefined;
          }}
          onTap={clickTile}
        />
        <Log g={g} />
      </section>
      </>
      )}

      {showScores && <ScoreSheet g={g} onClose={() => setShowScores(false)} />}

      {announcement && (
        <div className="round-announce-bg">
          <div className={`round-announce ${announcement.tranque ? 'tranque' : 'domino'}`} role="alert">
            <div className="ra-title">{announcement.title}</div>
            <div className="ra-detail">{announcement.detail}</div>
          </div>
        </div>
      )}

      {!announcement && (g.phase === 'roundOver' || g.phase === 'gameOver') && g.lastResult && (
        <RoundModal
          g={g}
          isHost={room.hostId === room.you}
          onNextRound={onNextRound}
          onLobby={onLobby}
          onShowScores={() => setShowScores(true)}
        />
      )}
    </main>
  );
}

/** Sorteo de la salida: todas las fichas boca abajo; cada pareja levanta una. */
function PickBoard({ g, onPick }: { g: GameView; onPick: (index: number) => void }) {
  const pick = g.pick!;
  const canPick = g.seat >= 0 && pick.pendingSides.includes(g.seats[g.seat].side);
  const byIndex = new Map(pick.picks.map((p) => [p.index, p]));
  const who = g.mode === 'teams' ? 'Un jugador de cada pareja' : 'Cada jugador';

  return (
    <section className="pick-area">
      <h2>¿Quién sale?</h2>
      <p className="muted">{who} levanta una ficha. La más alta sale.</p>
      <p className="pick-status">
        {canPick ? (
          <b>{g.mode === 'teams' ? 'Levanta una ficha por tu pareja.' : 'Levanta una ficha.'}</b>
        ) : (
          <>Esperando a: {pick.pendingSides.map((s) => sideName(g, s)).join(', ')}…</>
        )}
      </p>
      {pick.picks.length > 0 && (
        <div className="pick-chosen">
          {pick.picks.map((p) => (
            <div key={p.index} className="pick-chosen-item">
              <Domino a={p.tile[0]} b={p.tile[1]} size="md" />
              <span>{g.seats[p.player].name}</span>
            </div>
          ))}
        </div>
      )}
      <div className="pick-grid">
        {Array.from({ length: pick.count }, (_, i) => {
          const taken = byIndex.get(i);
          if (taken) {
            return (
              <span key={i} className="pick-slot taken" title={g.seats[taken.player].name}>
                <Domino a={taken.tile[0]} b={taken.tile[1]} size="sm" />
              </span>
            );
          }
          return canPick ? (
            <button key={i} type="button" className="pick-slot" onClick={() => onPick(i)} aria-label="Levantar ficha">
              <TileBack size="sm" />
            </button>
          ) : (
            <span key={i} className="pick-slot">
              <TileBack size="sm" />
            </span>
          );
        })}
      </div>
    </section>
  );
}

/** Resultado del sorteo, visible hasta que se juega la primera ficha. */
function PickSummary({ g }: { g: GameView }) {
  const pick = g.pick!;
  const winner = pick.winner!;
  return (
    <div className="pick-summary">
      <div className="pick-chosen">
        {pick.picks.map((p) => (
          <div key={p.index} className={`pick-chosen-item ${p.player === winner ? 'win' : ''}`}>
            <Domino a={p.tile[0]} b={p.tile[1]} size="sm" />
            <span>{g.seats[p.player].name}</span>
          </div>
        ))}
      </div>
      <div>
        La más alta: <b>{g.seats[winner].name}</b>
        {g.mode === 'teams' &&
          (g.seats[g.seat]?.side === g.seats[winner].side ? <> · ¡salen ustedes!</> : <> · salen ellos</>)}
      </div>
    </div>
  );
}

/** La pareja que sale discute quién abre: uno pide salir y el compañero lo permite. */
function StartAgreement({
  g,
  onRequest,
  onRespond,
}: {
  g: GameView;
  onRequest: () => void;
  onRespond: (accept: boolean) => void;
}) {
  const side = g.startSide!;
  const team = g.seats.map((s, i) => ({ ...s, i })).filter((s) => s.side === side);
  const mine = g.seats[g.seat]?.side === side;
  const partner = team.find((s) => s.i !== g.seat);
  const req = g.startRequest;
  const rejected = g.startRejectedBy !== null ? g.seats[g.startRejectedBy].name : null;

  if (!mine) {
    return (
      <div className="agree">
        <div>
          <b>{team.map((s) => s.name).join(' y ')}</b> discuten quién sale…
        </div>
        {req !== null && <div className="muted">{g.seats[req].name} pidió salir.</div>}
        {req === null && rejected && <div className="muted">{rejected} dijo que no.</div>}
      </div>
    );
  }

  if (req === null) {
    return (
      <div className="agree mine">
        <div>
          <b>Les toca salir.</b> Mira tus fichas y pide salir si te conviene.
        </div>
        {rejected && (
          <div className="agree-note">
            {g.startRejectedBy === g.seat ? 'No dejaste salir a tu compañero.' : `${rejected} no te dejó salir.`}
          </div>
        )}
        <button className="btn primary" onClick={onRequest}>
          Quiero salir
        </button>
      </div>
    );
  }

  if (req === g.seat) {
    return (
      <div className="agree mine">
        <div>Esperando a que {partner?.name} te deje salir…</div>
        <button className="btn" onClick={() => onRespond(false)}>
          Retirar
        </button>
      </div>
    );
  }

  return (
    <div className="agree mine ask">
      <div>
        <b>{g.seats[req].name}</b> quiere salir. ¿Le dejas?
      </div>
      <div className="row center">
        <button className="btn primary" onClick={() => onRespond(true)}>
          Sí, sal tú
        </button>
        <button className="btn" onClick={() => onRespond(false)}>
          No
        </button>
      </div>
    </div>
  );
}

/** Acumulado de puntos: lo que ganó cada bando en cada mano y el total tras ella. */
function ScoreSheet({ g, onClose }: { g: GameView; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sides = g.scores.map((_, side) => side);
  const leader = Math.max(...g.scores);

  return (
    <div className="modal-bg sheet-bg" onClick={onClose}>
      <div className="modal sheet" role="dialog" aria-label="Acumulado de puntos" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>📊 Acumulado de puntos</h2>
          <button className="btn tiny" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="muted small">Se juega a {g.targetScore} puntos.</p>

        <div className="sheet-totals">
          {sides.map((side) => (
            <div key={side} className={`sheet-total t${side} ${g.scores[side] === leader && leader > 0 ? 'lead' : ''}`}>
              <span className="st-name">{shortSideName(g, side)}</span>
              {g.mode === 'teams' && (
                <span className="st-players">
                  {g.seats
                    .filter((s) => s.side === side)
                    .map((s) => s.name)
                    .join(' y ')}
                </span>
              )}
              <strong>{g.scores[side]}</strong>
              <span className="st-left">
                {g.scores[side] >= g.targetScore ? '¡Ganó!' : `faltan ${g.targetScore - g.scores[side]}`}
              </span>
            </div>
          ))}
        </div>

        {g.history.length === 0 ? (
          <p className="muted">Todavía no ha terminado ninguna mano.</p>
        ) : (
          <div className="sheet-table-wrap">
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Mano</th>
                  <th>Resultado</th>
                  {sides.map((side) => (
                    <th key={side} className="num">
                      {shortSideName(g, side)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.history.map((h) => (
                  <tr key={h.round}>
                    <td className="num">{h.round}</td>
                    <td>
                      {h.winnerPlayer === null ? (
                        <span className="muted">Tranque, empate</span>
                      ) : (
                        <>
                          {g.seats[h.winnerPlayer].name}{' '}
                          <span className="muted">{h.reason === 'domino' ? 'se pegó' : 'ganó el tranque'}</span>
                        </>
                      )}
                    </td>
                    {sides.map((side) => (
                      <td key={side} className="num">
                        {h.winnerSide === side && <span className="gain">+{h.points}</span>}
                        <div className="acc">{h.scores[side]}</div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="row center">
          <button className="btn primary" onClick={onClose}>
            Volver al juego
          </button>
        </div>
      </div>
    </div>
  );
}

/** Cartel temporal cuando otro jugador se pasa. */
function usePassAlerts(g: GameView) {
  const [alerts, setAlerts] = useState<{ id: number; name: string }[]>([]);
  const seen = useRef<{ round: number; total: number } | null>(null);
  const nextId = useRef(0);

  useEffect(() => {
    const prev = seen.current;
    seen.current = { round: g.round, total: g.logTotal };
    // Primera carga (o reconexión): no avisar de lo que ya pasó.
    if (!prev) return;
    const fresh = prev.round === g.round ? g.logTotal - prev.total : g.logTotal;
    // Si la mano acaba de terminar (tranque), ya sale el cartel de fin de mano.
    if (fresh <= 0 || g.phase !== 'playing') return;
    const added = g.log
      .slice(-Math.min(fresh, g.log.length))
      .filter((l) => l.action === 'pass' && l.player !== g.seat)
      .map((l) => ({ id: nextId.current++, name: g.seats[l.player].name }));
    if (added.length === 0) return;
    setAlerts((a) => [...a, ...added]);
    const ids = new Set(added.map((a) => a.id));
    setTimeout(() => setAlerts((a) => a.filter((x) => !ids.has(x.id))), 3500);
  }, [g.round, g.logTotal, g.log, g.seat, g.seats, g.phase]);

  // Al terminar la mano se quitan los que quedaran en pantalla.
  return g.phase === 'playing' ? alerts : [];
}

/** Texto del final de la mano: se pegó (dominó) o se trancó. */
function roundHeadline(g: GameView): { title: string; detail: string } {
  const r = g.lastResult!;
  const winner = r.winnerPlayer !== null ? g.seats[r.winnerPlayer].name : null;
  const gain = (side: number) => {
    const who = shortSideName(g, side);
    const plural = who === 'Nosotros' || who === 'Ellos';
    return `${who === 'Nosotros' ? 'Ustedes' : who} ${plural ? 'suman' : 'suma'} ${r.points} puntos`;
  };
  if (r.reason === 'domino') {
    return { title: `¡${winner} se pegó!`, detail: gain(r.winnerSide!) };
  }
  if (r.winnerSide === null) {
    return { title: '¡Se trancó el juego!', detail: 'Empate a menos puntos: nadie suma' };
  }
  return {
    title: '¡Se trancó el juego!',
    detail: `Gana ${winner} con ${r.handPoints[r.winnerPlayer!]} puntos en la mano · ${gain(r.winnerSide)}`,
  };
}

/**
 * Cartel grande al acabar la mano. Solo aparece al ver terminar la mano en directo
 * (no al recargar la página) y, mientras se muestra, se retrasa el resumen.
 */
function useRoundAnnouncement(g: GameView) {
  const [shown, setShown] = useState<{ title: string; detail: string; tranque: boolean } | null>(null);
  const prev = useRef<{ phase: GameView['phase']; round: number } | null>(null);

  useEffect(() => {
    const before = prev.current;
    prev.current = { phase: g.phase, round: g.round };
    const ended = g.phase === 'roundOver' || g.phase === 'gameOver';
    if (!before || !ended || !g.lastResult) return;
    if (before.phase !== 'playing' || before.round !== g.round) return;
    setShown({ ...roundHeadline(g), tranque: g.lastResult.reason === 'tranque' });
    const t = setTimeout(() => setShown(null), 3000);
    return () => clearTimeout(t);
  }, [g.phase, g.round]); // eslint-disable-line react-hooks/exhaustive-deps

  return shown;
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
  onShowScores,
}: {
  g: GameView;
  isHost: boolean;
  onNextRound: () => void;
  onLobby: () => void;
  onShowScores: () => void;
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
          <h2>{roundHeadline(g).title}</h2>
        )}
        <p>
          {r.reason === 'domino' ? (
            `${g.seats[r.winnerPlayer!].name} se quedó sin fichas.`
          ) : r.winnerPlayer !== null ? (
            <>
              Nadie puede jugar. Gana <b>{g.seats[r.winnerPlayer].name}</b>, que tiene menos puntos en la mano (
              {r.handPoints[r.winnerPlayer]}).
            </>
          ) : (
            'Nadie puede jugar y hay empate a menos puntos entre las dos parejas.'
          )}{' '}
          {r.winnerSide !== null ? (
            <>
              <b>{sideName(g, r.winnerSide)}</b> suma <b>{r.points}</b> puntos.
            </>
          ) : (
            'Nadie suma puntos.'
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
          <button className="btn" onClick={onShowScores}>
            📊 Ver acumulado
          </button>
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
