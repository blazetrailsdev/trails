import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConnectionHandler } from "./abstract/connection-handler.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { ambientPoolConfiguration } from "../test-adapter.js";
import { inMemoryDb } from "../support/adapter-helper.js";

// Rails wraps every test in this file in `unless in_memory_db?`
// (connection_handlers_multi_pool_config_test.rb:21) because they open a real
// connection against a file-backed database — its hardcoded
// "test/db/primary.sqlite3" (`:27,:54,:78`) is the file-backed equivalent of
// our ambient lane config, so the pools here ride that instead of `:memory:`.
describe.skipIf(inMemoryDb())("ConnectionHandlersMultiPoolConfigTest", () => {
  let handler: ConnectionHandler;

  const primaryConfig = () => new HashConfig("default_env", "primary", ambientPoolConfiguration());

  beforeEach(() => {
    handler = new ConnectionHandler();
  });

  afterEach(async () => {
    await handler.clearAllConnectionsBang();
  });

  it("establish connection with pool configs", () => {
    handler.establishConnection(primaryConfig(), { owner: "primary" });
    handler.establishConnection(primaryConfig(), { owner: "primary", shard: "pool_config_two" });

    const defaultPool = handler.retrieveConnectionPool("primary", { shard: "default" });
    const otherPool = handler.retrieveConnectionPool("primary", { shard: "pool_config_two" });

    expect(defaultPool).not.toBeUndefined();
    expect(defaultPool).not.toBe(otherPool);

    // :default if passed with no key
    expect(handler.retrieveConnectionPool("primary")).toBe(defaultPool);
  });

  it("remove connection", () => {
    handler.establishConnection(primaryConfig(), { owner: "primary" });
    handler.establishConnection(primaryConfig(), { owner: "primary", shard: "pool_config_two" });

    // remove default
    handler.removeConnectionPool("primary");

    expect(handler.retrieveConnectionPool("primary")).toBeUndefined();
    expect(
      handler.retrieveConnectionPool("primary", { shard: "pool_config_two" }),
    ).not.toBeUndefined();
  });

  it("connected?", async () => {
    handler.establishConnection(primaryConfig(), { owner: "primary" });
    handler.establishConnection(primaryConfig(), { owner: "primary", shard: "pool_config_two" });

    // connect to default
    await handler.connectionPoolList("writing")[0].leaseConnection();

    expect(handler.isConnected("primary")).toBe(true);
    expect(handler.isConnected("primary", { shard: "default" })).toBe(true);
    expect(handler.isConnected("primary", { shard: "pool_config_two" })).toBe(false);
  });
});
