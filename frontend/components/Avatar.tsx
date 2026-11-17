import { Avatar as A } from '@/lib/types';

/**
 * Personaje del jugador. Por ahora es un marcador en CSS; aquí irá el componente de Rive:
 *
 *   const { RiveComponent, rive } = useRive({ src: '/avatar.riv', stateMachines: 'Avatar', autoplay: true });
 *   // inputs de la máquina de estados: estado ('esperando' | 'pensando' | 'celebrando'…),
 *   // piezas del avatar (body, face, hair, color) y un trigger por gesto.
 *
 * `mood` y `gesture` son justo esos inputs.
 */
export type Mood = 'esperando' | 'pensando' | 'desconectado';

const FACES: Record<string, string> = { smile: '🙂', cool: '😎', wink: '😉', serious: '😐', laugh: '😄' };
const GESTURES: Record<string, string> = {
  celebrar: '🎉',
  encogerse: '🤷',
  golpe_mesa: '✊',
  bailar: '💃',
  llorar: '😢',
  saludar: '👋',
  pensar: '🤔',
};
export const GESTURE_NAMES = Object.keys(GESTURES);
export const FACE_NAMES = Object.keys(FACES);

export function AvatarView({ avatar, mood, gesture }: { avatar: A; mood: Mood; gesture?: string }) {
  return (
    <div className={`avatar mood-${mood} ${gesture ? `gesture gesture-${gesture}` : ''}`} style={{ background: avatar.color }}>
      <span className="avatar-face">{FACES[avatar.face] ?? '🙂'}</span>
      {gesture && <span className="avatar-gesture">{GESTURES[gesture] ?? '✨'}</span>}
    </div>
  );
}
