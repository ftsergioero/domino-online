import { ReactionConfig } from '../domain';

/** Piezas del personaje; el cliente las pasa como inputs a la máquina de estados de Rive. */
export interface Avatar {
  body: string;
  face: string;
  hair: string;
  color: string;
}

export interface Profile {
  playerId: string;
  name: string;
  avatar: Avatar;
  reactions: ReactionConfig[];
}

export interface MatchRecord {
  tableId: string;
  players: { seat: number; playerId: string; name: string }[];
  score: [number, number];
  winnerTeam: 0 | 1;
  hands: number;
  rules: object;
}

export const DEFAULT_AVATAR: Avatar = { body: 'basic', face: 'smile', hair: 'short', color: '#2a9d8f' };

export const DEFAULT_REACTIONS: ReactionConfig[] = [
  { event: 'pegarse', gesture: 'celebrar', phrase: '¡Me pegué, caballero!' },
  { event: 'pasar', gesture: 'encogerse', phrase: 'Paso…' },
  { event: 'tranque', gesture: 'golpe_mesa', phrase: '¡Tranque!' },
  { event: 'capicua', gesture: 'bailar', phrase: '¡Capicúa!' },
  { event: 'ganar_partida', gesture: 'celebrar', phrase: '¡Agua! Partida ganada' },
];
