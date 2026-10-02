import { ArgumentError } from "@blazetrails/activemodel";
import { hashDelete } from "@blazetrails/ruby-compat";
import type { PoolConfig } from "./pool-config.js";

export class PoolManager {
  private _roleToShardMapping: Record<string, Record<string, PoolConfig>>;

  constructor() {
    this._roleToShardMapping = new Proxy({} as Record<string, Record<string, PoolConfig>>, {
      get(h, k) {
        if (typeof k !== "string") return Reflect.get(h, k);
        return (h[k] ??= {});
      },
    });
  }

  /** @missingRailsName roleToShardMapping — PERMANENT */
  get shardNames(): string[] {
    return [
      ...new Set(
        Object.values(this._roleToShardMapping).flatMap((shardMap) => Object.keys(shardMap)),
      ),
    ];
  }

  /** @missingRailsName roleToShardMapping — PERMANENT */
  get roleNames(): string[] {
    return Object.keys(this._roleToShardMapping);
  }

  poolConfigs(role?: string): PoolConfig[] {
    if (role != null) {
      return Object.values(this._roleToShardMapping[role]);
    }
    return Object.values(this._roleToShardMapping).flatMap((shardMap) => Object.values(shardMap));
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
      for (const poolConfig of Object.values(this._roleToShardMapping[role])) {
        cb(poolConfig);
      }
    } else {
      for (const shardMap of Object.values(this._roleToShardMapping)) {
        for (const poolConfig of Object.values(shardMap)) {
          cb(poolConfig);
        }
      }
    }
  }

  removeRole(role: string): Record<string, PoolConfig> | null {
    return hashDelete(this._roleToShardMapping, role);
  }

  removePoolConfig(role: string, shard: string): PoolConfig | null {
    return hashDelete(this._roleToShardMapping[role], shard);
  }

  getPoolConfig(role: string, shard: string): PoolConfig | undefined {
    return this._roleToShardMapping[role][shard];
  }

  setPoolConfig(role: string, shard: string, poolConfig: PoolConfig): void {
    if (!poolConfig) {
      throw new ArgumentError(
        `The \`poolConfig\` for the :${role} role and :${shard} shard was \`null\`. ` +
          `Please check your connection configuration for this role and shard and ensure a valid ` +
          `pool configuration is provided.`,
      );
    }
    this._roleToShardMapping[role][shard] = poolConfig;
  }
}
