import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConnectionHandler } from "./abstract/connection-handler.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { ambientPoolConfiguration } from "../test-adapter.js";
import { inMemoryDb } from "../support/adapter-helper.js";

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
    await (await handler.connectionPoolList("writing")[0].checkout()).connectBang();

    expect(handler.isConnected("primary")).toBe(true);
    expect(handler.isConnected("primary", { shard: "default" })).toBe(true);
    expect(handler.isConnected("primary", { shard: "pool_config_two" })).toBe(false);
  });
});
