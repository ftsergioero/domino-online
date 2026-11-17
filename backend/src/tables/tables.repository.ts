import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { TableRecord } from './table.types';

export abstract class TablesRepository {
  abstract get(id: string): Promise<TableRecord | null>;
  abstract save(table: TableRecord): Promise<void>;
  abstract getPlayerTable(playerId: string): Promise<string | null>;
  abstract setPlayerTable(playerId: string, tableId: string | null): Promise<void>;
}

const TTL_SECONDS = 60 * 60 * 24; // las mesas inactivas caducan en 24 h

/** Mesas en curso en Redis (sobreviven a reinicios del servidor y permiten reconectar). */
@Injectable()
export class RedisTablesRepository extends TablesRepository implements OnModuleDestroy {
  constructor(private readonly redis: Redis) {
    super();
  }

  async get(id: string) {
    const raw = await this.redis.get(`domino:table:${id}`);
    return raw ? (JSON.parse(raw) as TableRecord) : null;
  }

  async save(table: TableRecord) {
    await this.redis.set(`domino:table:${table.id}`, JSON.stringify(table), 'EX', TTL_SECONDS);
  }

  async getPlayerTable(playerId: string) {
    return this.redis.get(`domino:player:${playerId}:table`);
  }

  async setPlayerTable(playerId: string, tableId: string | null) {
    const key = `domino:player:${playerId}:table`;
    if (tableId) await this.redis.set(key, tableId, 'EX', TTL_SECONDS);
    else await this.redis.del(key);
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}

/** Alternativa para desarrollo y tests: misma semántica (copias JSON), sin Redis. */
@Injectable()
export class MemoryTablesRepository extends TablesRepository {
  private tables = new Map<string, string>();
  private players = new Map<string, string>();

  async get(id: string) {
    const raw = this.tables.get(id);
    return raw ? (JSON.parse(raw) as TableRecord) : null;
  }

  async save(table: TableRecord) {
    this.tables.set(table.id, JSON.stringify(table));
  }

  async getPlayerTable(playerId: string) {
    return this.players.get(playerId) ?? null;
  }

  async setPlayerTable(playerId: string, tableId: string | null) {
    if (tableId) this.players.set(playerId, tableId);
    else this.players.delete(playerId);
  }
}
