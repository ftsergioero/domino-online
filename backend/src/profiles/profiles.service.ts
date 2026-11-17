import { Injectable } from '@nestjs/common';
import { ReactionEvent, findReaction } from '../domain';
import { cleanAvatar, cleanName, cleanReactions } from './profile.validation';
import { MatchRecord, Profile } from './profile.types';
import { ProfilesRepository, newProfile } from './profiles.repository';

@Injectable()
export class ProfilesService {
  constructor(private readonly repo: ProfilesRepository) {}

  get(playerId: string) {
    return this.repo.find(playerId);
  }

  /** Devuelve el perfil del jugador, creándolo (con reacciones por defecto) si no existe. */
  async ensure(playerId: string, name: string): Promise<Profile> {
    const existing = await this.repo.find(playerId);
    if (existing) {
      if (existing.name !== name) {
        existing.name = name;
        await this.repo.upsert(existing);
      }
      return existing;
    }
    return this.repo.upsert(newProfile(playerId, name));
  }

  async update(playerId: string, body: { name?: unknown; avatar?: unknown; reactions?: unknown }) {
    const current = (await this.repo.find(playerId)) ?? newProfile(playerId, cleanName(body.name ?? 'Jugador'));
    if (body.name !== undefined) current.name = cleanName(body.name);
    if (body.avatar !== undefined) current.avatar = cleanAvatar(body.avatar);
    if (body.reactions !== undefined) current.reactions = cleanReactions(body.reactions);
    return this.repo.upsert(current);
  }

  async reactionFor(playerId: string, event: ReactionEvent) {
    const profile = await this.repo.find(playerId);
    return findReaction(profile?.reactions, event);
  }

  recordMatch(record: MatchRecord) {
    return this.repo.recordMatch(record);
  }

  history(playerId: string, limit = 20) {
    return this.repo.history(playerId, limit);
  }
}
