/**
 * Pool manager — manages pool configs per role and shard.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PoolManager
 */

import { ArgumentError } from "@blazetrails/activemodel";
import type { PoolConfig } from "./pool-config.js";

export class PoolManager {
  private _roleToShardMapping: Map<string, Map<string, PoolConfig>>;

  constructor() {
    this._roleToShardMapping = new Map();
  }

  get shardNames(): string[] {
    const shards = new Set<string>();
    for (const shardMap of this._roleToShardMapping.values()) {
      for (const shard of shardMap.keys()) {
        shards.add(shard);
      }
    }
    return [...shards];
  }

  get roleNames(): string[] {
    return [...this._roleToShardMapping.keys()];
  }

  poolConfigs(role?: string): PoolConfig[] {
    if (role != null) {
      const shardMap = this._roleToShardMapping.get(role);
      return shardMap ? [...shardMap.values()] : [];
    }
    const result: PoolConfig[] = [];
    for (const shardMap of this._roleToShardMapping.values()) {
      for (const poolConfig of shardMap.values()) {
        result.push(poolConfig);
      }
    }
    return result;
  }

  eachPoolConfig(role: string | undefined, callback: (poolConfig: PoolConfig) => void): void;
  eachPoolConfig(callback: (poolConfig: PoolConfig) => void): void;
  eachPoolConfig(
    roleOrCallback: string | undefined | ((poolConfig: PoolConfig) => void),
    callback?: (poolConfig: PoolConfig) => void,
  ): void {
    let role: string | undefined;
    let cb: (poolConfig: PoolConfig) => void;

    if (typeof roleOrCallback === "function") {
      cb = roleOrCallback;
    } else {
      role = roleOrCallback;
      if (typeof callback !== "function") {
        throw new ArgumentError("`eachPoolConfig` requires a callback when a role is provided.");
      }
      cb = callback;
    }

    if (role != null) {
      const shardMap = this._roleToShardMapping.get(role);
      if (shardMap) {
        for (const poolConfig of shardMap.values()) {
          cb(poolConfig);
        }
      }
    } else {
      for (const shardMap of this._roleToShardMapping.values()) {
        for (const poolConfig of shardMap.values()) {
          cb(poolConfig);
        }
      }
    }
  }

  removeRole(role: string): boolean {
    return this._roleToShardMapping.delete(role);
  }

  removePoolConfig(role: string, shard: string): PoolConfig | undefined {
    const shardMap = this._roleToShardMapping.get(role);
    if (!shardMap) return undefined;
    const poolConfig = shardMap.get(shard);
    shardMap.delete(shard);
    if (shardMap.size === 0) this._roleToShardMapping.delete(role);
    return poolConfig;
  }

  getPoolConfig(role: string, shard: string): PoolConfig | undefined {
    return this._roleToShardMapping.get(role)?.get(shard);
  }

  setPoolConfig(role: string, shard: string, poolConfig: PoolConfig): void {
    if (!poolConfig) {
      throw new ArgumentError(
        `The \`poolConfig\` for the :${role} role and :${shard} shard was \`null\`. ` +
          `Please check your connection configuration for this role and shard and ensure a valid ` +
          `pool configuration is provided.`,
      );
    }
    let shardMap = this._roleToShardMapping.get(role);
    if (!shardMap) {
      shardMap = new Map();
      this._roleToShardMapping.set(role, shardMap);
    }
    shardMap.set(shard, poolConfig);
  }
}
