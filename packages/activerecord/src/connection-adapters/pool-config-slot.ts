import type { PoolConfig } from "./pool-config.js";

/** @internal */

export let _PoolConfig: typeof PoolConfig | undefined;

/** @internal */

export function _setPoolConfig(poolConfig: typeof PoolConfig): void {
  _PoolConfig = poolConfig;
}
