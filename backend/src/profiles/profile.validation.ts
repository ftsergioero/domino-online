import { ReactionConfig, isReactionEvent } from '../domain';
import { Avatar } from './profile.types';

const str = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

export const isPlayerId = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v);

export function cleanName(v: unknown): string {
  if (typeof v !== 'string') throw new Error('Nombre inválido');
  const name = v.trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!name) throw new Error('Nombre inválido');
  return name;
}

export function cleanAvatar(v: unknown): Avatar {
  const a = v as Partial<Avatar>;
  if (!a || typeof a !== 'object') throw new Error('Avatar inválido');
  for (const k of ['body', 'face', 'hair', 'color'] as const) if (!str(a[k], 32)) throw new Error(`Avatar: ${k} inválido`);
  return { body: a.body!, face: a.face!, hair: a.hair!, color: a.color! };
}

export function cleanReactions(v: unknown): ReactionConfig[] {
  if (!Array.isArray(v) || v.length > 20) throw new Error('Reacciones inválidas');
  const seen = new Set<string>();
  return v.map((r) => {
    if (!r || !isReactionEvent(r.event)) throw new Error('Evento de reacción inválido');
    if (seen.has(r.event)) throw new Error(`Evento repetido: ${r.event}`);
    seen.add(r.event);
    if (!str(r.gesture, 32)) throw new Error('Gesto inválido');
    if (typeof r.phrase !== 'string' || r.phrase.length > 120) throw new Error('Frase inválida');
    return { event: r.event, gesture: r.gesture, phrase: r.phrase.trim() };
  });
}
