'use client';
import { useEffect, useState } from 'react';
import { getPlayerId, SERVER_URL } from '@/lib/useGame';
import { Profile, REACTION_EVENTS, ReactionConfig, ReactionEvent } from '@/lib/types';
import { AvatarView, FACE_NAMES, GESTURE_NAMES } from './Avatar';

const EVENT_LABELS: Record<ReactionEvent, string> = {
  pegarse: 'Al pegarme',
  pasar: 'Al pasar',
  tranque: 'Al trancar',
  capicua: 'Capicúa',
  ganar_mano: 'Ganar la mano',
  perder_mano: 'Perder la mano',
  ganar_partida: 'Ganar la partida',
  perder_partida: 'Perder la partida',
};

/** Personaje y reacciones: un gesto y una frase por evento del juego. */
export function ProfileEditor({ name, onClose }: { name: string; onClose: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const url = () => `${SERVER_URL}/profiles/${getPlayerId()}`;

  useEffect(() => {
    fetch(url())
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Profile | null) =>
        setProfile(
          p ?? {
            playerId: getPlayerId(),
            name,
            avatar: { body: 'basic', face: 'smile', hair: 'short', color: '#2a9d8f' },
            reactions: [],
          },
        ),
      )
      .catch(() => setMsg('No se pudo cargar el perfil'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile) return <div className="modal"><div className="card">{msg ?? 'Cargando…'}</div></div>;

  const reactionOf = (e: ReactionEvent) => profile.reactions.find((r) => r.event === e);
  const setReaction = (e: ReactionEvent, patch: Partial<ReactionConfig> | null) => {
    const rest = profile.reactions.filter((r) => r.event !== e);
    const cur = reactionOf(e) ?? { event: e, gesture: GESTURE_NAMES[0], phrase: '' };
    setProfile({ ...profile, reactions: patch ? [...rest, { ...cur, ...patch }] : rest });
  };

  async function save() {
    const res = await fetch(url(), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, avatar: profile!.avatar, reactions: profile!.reactions }),
    });
    const body = await res.json();
    setMsg(res.ok ? 'Guardado. Se aplica en la próxima mesa a la que entres.' : body.message);
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="card profile" onClick={(e) => e.stopPropagation()}>
        <h2>Mi personaje</h2>
        <div className="avatar-row">
          <AvatarView avatar={profile.avatar} mood="esperando" />
          <label>
            Cara
            <select
              value={profile.avatar.face}
              onChange={(e) => setProfile({ ...profile, avatar: { ...profile.avatar, face: e.target.value } })}
            >
              {FACE_NAMES.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label>
            Color
            <input
              type="color"
              value={profile.avatar.color}
              onChange={(e) => setProfile({ ...profile, avatar: { ...profile.avatar, color: e.target.value } })}
            />
          </label>
        </div>
        <h3>Reacciones</h3>
        <table className="reactions">
          <tbody>
            {REACTION_EVENTS.map((e) => {
              const r = reactionOf(e);
              return (
                <tr key={e}>
                  <td>
                    <label className="check">
                      <input type="checkbox" checked={!!r} onChange={(ev) => setReaction(e, ev.target.checked ? {} : null)} />
                      {EVENT_LABELS[e]}
                    </label>
                  </td>
                  <td>
                    <select disabled={!r} value={r?.gesture ?? ''} onChange={(ev) => setReaction(e, { gesture: ev.target.value })}>
                      {!r && <option value="">—</option>}
                      {GESTURE_NAMES.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      disabled={!r}
                      maxLength={120}
                      placeholder="Frase"
                      value={r?.phrase ?? ''}
                      onChange={(ev) => setReaction(e, { phrase: ev.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {msg && <p className="hint">{msg}</p>}
        <div className="actions">
          <button onClick={onClose}>Cerrar</button>
          <button className="primary" onClick={save}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
