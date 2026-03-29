/**
 * Pool manager — manages connection pools per role and shard.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PoolManager
 */

import type { ConnectionPool } from "./abstract/connection-pool.js";

export class PoolManager {
  private _pools = new Map<string, Map<string, ConnectionPool>>();

  getPool(role: string, shard: string): ConnectionPool | undefined {
    return this._pools.get(role)?.get(shard);
  }

  setPool(role: string, shard: string, pool: ConnectionPool): void {
    let roleMap = this._pools.get(role);
    if (!roleMap) {
      roleMap = new Map();
      this._pools.set(role, roleMap);
    }
    roleMap.set(shard, pool);
  }

  removePool(role: string, shard: string): boolean {
    const roleMap = this._pools.get(role);
    if (!roleMap) return false;
    const deleted = roleMap.delete(shard);
    if (roleMap.size === 0) this._pools.delete(role);
    return deleted;
  }

  get poolEntries(): Array<{ role: string; shard: string; pool: ConnectionPool }> {
    const result: Array<{ role: string; shard: string; pool: ConnectionPool }> = [];
    for (const [role, shardMap] of this._pools) {
      for (const [shard, pool] of shardMap) {
        result.push({ role, shard, pool });
      }
    }
    return result;
  }

  get roles(): string[] {
    return [...this._pools.keys()];
  }

  get shardNames(): string[] {
    const shards = new Set<string>();
    for (const shardMap of this._pools.values()) {
      for (const shard of shardMap.keys()) {
        shards.add(shard);
      }
    }
    return [...shards];
  }

  disconnectAll(): void {
    for (const shardMap of this._pools.values()) {
      for (const pool of shardMap.values()) {
        pool.disconnect();
      }
    }
    this._pools.clear();
  }
}
