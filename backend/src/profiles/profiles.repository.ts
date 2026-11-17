import { Injectable } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { MatchHistoryModel, ProfileModel, UserModel } from './profile.models';
import { DEFAULT_AVATAR, DEFAULT_REACTIONS, MatchRecord, Profile } from './profile.types';

export abstract class ProfilesRepository {
  abstract find(playerId: string): Promise<Profile | null>;
  abstract upsert(profile: Profile): Promise<Profile>;
  abstract recordMatch(record: MatchRecord): Promise<void>;
  abstract history(playerId: string, limit: number): Promise<(MatchRecord & { finishedAt: Date })[]>;
}

export const newProfile = (playerId: string, name: string): Profile => ({
  playerId,
  name,
  avatar: { ...DEFAULT_AVATAR },
  reactions: DEFAULT_REACTIONS.map((r) => ({ ...r })),
});

@Injectable()
export class SequelizeProfilesRepository extends ProfilesRepository {
  constructor(private readonly sequelize: Sequelize) {
    super();
  }

  async find(playerId: string) {
    const user = await UserModel.findByPk(playerId, { include: [ProfileModel] });
    if (!user) return null;
    return {
      playerId: user.id,
      name: user.name,
      avatar: user.profile?.avatar ?? { ...DEFAULT_AVATAR },
      reactions: user.profile?.reactions ?? [],
    };
  }

  async upsert(p: Profile) {
    await this.sequelize.transaction(async (transaction) => {
      await UserModel.upsert({ id: p.playerId, name: p.name }, { transaction });
      await ProfileModel.upsert(
        { userId: p.playerId, avatar: p.avatar, reactions: p.reactions },
        { transaction },
      );
    });
    return p;
  }

  async recordMatch(r: MatchRecord) {
    await MatchHistoryModel.create({ ...r });
  }

  async history(playerId: string, limit: number) {
    // Filtrado en memoria sobre las últimas partidas: suficiente para el MVP.
    const rows = await MatchHistoryModel.findAll({ order: [['createdAt', 'DESC']], limit: 500 });
    return rows
      .filter((m) => m.players.some((p) => p.playerId === playerId))
      .slice(0, limit)
      .map((m) => ({
        tableId: m.tableId,
        players: m.players,
        score: m.score,
        winnerTeam: m.winnerTeam as 0 | 1,
        hands: m.hands,
        rules: m.rules,
        finishedAt: m.createdAt,
      }));
  }
}

@Injectable()
export class MemoryProfilesRepository extends ProfilesRepository {
  private profiles = new Map<string, Profile>();
  private matches: (MatchRecord & { finishedAt: Date })[] = [];

  async find(playerId: string) {
    const p = this.profiles.get(playerId);
    return p ? structuredClone(p) : null;
  }

  async upsert(p: Profile) {
    this.profiles.set(p.playerId, structuredClone(p));
    return p;
  }

  async recordMatch(r: MatchRecord) {
    this.matches.unshift({ ...structuredClone(r), finishedAt: new Date() });
  }

  async history(playerId: string, limit: number) {
    return this.matches.filter((m) => m.players.some((p) => p.playerId === playerId)).slice(0, limit);
  }
}
