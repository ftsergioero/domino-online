import { BelongsTo, Column, DataType, ForeignKey, HasOne, Model, Table } from 'sequelize-typescript';
import { ReactionConfig } from '../domain';
import { Avatar } from './profile.types';

@Table({ tableName: 'users' })
export class UserModel extends Model {
  @Column({ type: DataType.STRING(64), primaryKey: true })
  declare id: string; // playerId generado por el cliente

  @Column({ type: DataType.STRING(24), allowNull: false })
  declare name: string;

  @HasOne(() => ProfileModel)
  declare profile?: InstanceType<typeof ProfileModel>; // evita referencia circular en los metadatos
}

@Table({ tableName: 'profiles' })
export class ProfileModel extends Model {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.STRING(64), primaryKey: true })
  declare userId: string;

  @Column({ type: DataType.JSON, allowNull: false })
  declare avatar: Avatar;

  @Column({ type: DataType.JSON, allowNull: false })
  declare reactions: ReactionConfig[];

  @BelongsTo(() => UserModel)
  declare user?: InstanceType<typeof UserModel>;
}

@Table({ tableName: 'match_history' })
export class MatchHistoryModel extends Model {
  @Column({ type: DataType.STRING(16), allowNull: false })
  declare tableId: string;

  @Column({ type: DataType.JSON, allowNull: false })
  declare players: { seat: number; playerId: string; name: string }[];

  @Column({ type: DataType.JSON, allowNull: false })
  declare score: [number, number];

  @Column({ type: DataType.TINYINT, allowNull: false })
  declare winnerTeam: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare hands: number;

  @Column({ type: DataType.JSON, allowNull: false })
  declare rules: object;
}

export const MODELS = [UserModel, ProfileModel, MatchHistoryModel];
