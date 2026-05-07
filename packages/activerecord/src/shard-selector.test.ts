import { describe, it } from "vitest";

describe("ShardSelectorTest", () => {
  it.skip("middleware locks to shard by default", () => {
    // BLOCKED: connection-pool — sharding / shard-selector not fully implemented
    // ROOT-CAUSE: connection-handling.ts#connectedTo shard routing + connection-adapters/abstract/connection-handler.ts pool-per-shard not fully implemented
    // SCOPE: ~100 LOC in connection-handling.ts + connection-adapters/abstract/connection-handler.ts; affects ~19–26 tests in sharding files
  });
  it.skip("middleware can turn off lock option", () => {
    // BLOCKED: connection-pool — sharding / shard-selector not fully implemented
    // ROOT-CAUSE: connection-handling.ts#connectedTo shard routing + connection-adapters/abstract/connection-handler.ts pool-per-shard not fully implemented
    // SCOPE: ~100 LOC in connection-handling.ts + connection-adapters/abstract/connection-handler.ts; affects ~19–26 tests in sharding files
  });
  it.skip("middleware can change shards", () => {
    // BLOCKED: connection-pool — sharding / shard-selector not fully implemented
    // ROOT-CAUSE: connection-handling.ts#connectedTo shard routing + connection-adapters/abstract/connection-handler.ts pool-per-shard not fully implemented
    // SCOPE: ~100 LOC in connection-handling.ts + connection-adapters/abstract/connection-handler.ts; affects ~19–26 tests in sharding files
  });
  it.skip("middleware can handle string shards", () => {
    // BLOCKED: connection-pool — sharding / shard-selector not fully implemented
    // ROOT-CAUSE: connection-handling.ts#connectedTo shard routing + connection-adapters/abstract/connection-handler.ts pool-per-shard not fully implemented
    // SCOPE: ~100 LOC in connection-handling.ts + connection-adapters/abstract/connection-handler.ts; affects ~19–26 tests in sharding files
  });
});
