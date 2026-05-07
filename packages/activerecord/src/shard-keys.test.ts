import { describe, it } from "vitest";

describe("ShardsKeysTest", () => {
  it.skip("connects to sets shard keys", () => {
    // BLOCKED: connection-pool — sharding / shard-selector not fully implemented
    // ROOT-CAUSE: connection-handling.ts#connectedTo shard routing + connection-adapters/abstract/connection-handler.ts pool-per-shard not fully implemented
    // SCOPE: ~100 LOC in connection-handling.ts + connection-adapters/abstract/connection-handler.ts; affects ~19–26 tests in sharding files
  });
  it.skip("connects to sets shard keys for descendents", () => {
    // BLOCKED: connection-pool — sharding / shard-selector not fully implemented
    // ROOT-CAUSE: connection-handling.ts#connectedTo shard routing + connection-adapters/abstract/connection-handler.ts pool-per-shard not fully implemented
    // SCOPE: ~100 LOC in connection-handling.ts + connection-adapters/abstract/connection-handler.ts; affects ~19–26 tests in sharding files
  });
  it.skip("sharded?", () => {
    // BLOCKED: connection-pool — sharding / shard-selector not fully implemented
    // ROOT-CAUSE: connection-handling.ts#connectedTo shard routing + connection-adapters/abstract/connection-handler.ts pool-per-shard not fully implemented
    // SCOPE: ~100 LOC in connection-handling.ts + connection-adapters/abstract/connection-handler.ts; affects ~19–26 tests in sharding files
  });
  it.skip("connected to all shards", () => {
    // BLOCKED: connection-pool — sharding / shard-selector not fully implemented
    // ROOT-CAUSE: connection-handling.ts#connectedTo shard routing + connection-adapters/abstract/connection-handler.ts pool-per-shard not fully implemented
    // SCOPE: ~100 LOC in connection-handling.ts + connection-adapters/abstract/connection-handler.ts; affects ~19–26 tests in sharding files
  });
  it.skip("connected to all shards can switch each to reading role", () => {
    // BLOCKED: connection-pool — sharding / shard-selector not fully implemented
    // ROOT-CAUSE: connection-handling.ts#connectedTo shard routing + connection-adapters/abstract/connection-handler.ts pool-per-shard not fully implemented
    // SCOPE: ~100 LOC in connection-handling.ts + connection-adapters/abstract/connection-handler.ts; affects ~19–26 tests in sharding files
  });
  it.skip("connected to all shards respects preventing writes", () => {
    // BLOCKED: connection-pool — sharding / shard-selector not fully implemented
    // ROOT-CAUSE: connection-handling.ts#connectedTo shard routing + connection-adapters/abstract/connection-handler.ts pool-per-shard not fully implemented
    // SCOPE: ~100 LOC in connection-handling.ts + connection-adapters/abstract/connection-handler.ts; affects ~19–26 tests in sharding files
  });
});
