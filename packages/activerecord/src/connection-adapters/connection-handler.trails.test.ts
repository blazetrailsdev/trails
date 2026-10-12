import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { IsolatedExecutionState } from "@blazetrails/activesupport";
import { ConnectionHandler } from "./abstract/connection-handler.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { Base } from "../base.js";
import { ambientPoolConfiguration } from "../test-adapter.js";
import { restoreWorkerConnection } from "../support/connection.js";

describe("ConnectionHandler selector defaults (trails)", () => {
  let handler: ConnectionHandler;

  beforeEach(() => {
    handler = new ConnectionHandler();
  });

  it("establish_connection defaults role to Base.current_role", async () => {
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    await Base.connectedTo({ role: "reading" }, async () => {
      await handler.establishConnection(config, { ownerName: "primary" });
    });

    expect(handler.retrieveConnectionPool("primary", { role: "reading" })).toBeTruthy();
    expect(handler.retrieveConnectionPool("primary", { role: "writing" })).toBeUndefined();
  });

  it("establish_connection defaults shard to Base.current_shard", async () => {
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    await Base.connectedTo({ shard: "shard_one" }, async () => {
      await handler.establishConnection(config, { ownerName: "primary" });
    });

    expect(handler.retrieveConnectionPool("primary", { shard: "shard_one" })).toBeTruthy();
    expect(handler.retrieveConnectionPool("primary", { shard: "default" })).toBeUndefined();
  });

  it("connected? and retrieve_connection read the current role", async () => {
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    await handler.establishConnection(config, { ownerName: "primary", role: "reading" });

    expect(handler.isConnected("primary")).toBe(false);

    await Base.connectedTo({ role: "reading" }, async () => {
      const conn = await handler.retrieveConnection("primary");
      expect(conn).toBeTruthy();
      await conn.verifyBang();
      expect(handler.isConnected("primary")).toBe(true);
    });

    handler.retrieveConnectionPool("primary", { role: "reading" })!.releaseConnection();
  });

  it("prevent_writes is read from the execution state, not from the handler", () => {
    const other = new ConnectionHandler();
    handler.preventWrites = true;
    try {
      expect(other.preventWrites).toBe(true);
      expect(IsolatedExecutionState.get("active_record_prevent_writes")).toBe(true);
    } finally {
      handler.preventWrites = null;
    }
    expect(other.preventWrites).toBeNull();
  });
});

describe("ConnectionHandler (trails)", () => {
  let handler: ConnectionHandler;

  beforeEach(async () => {
    await restoreWorkerConnection();
    handler = new ConnectionHandler();
  });

  afterEach(async () => {
    await restoreWorkerConnection();
  });

  it("establish connection returns same pool for same config", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const pool1 = await handler.establishConnection(config, {
      ownerName: "primary",
    });
    const pool2 = handler.retrieveConnectionPool("primary");
    expect(pool1).toBe(pool2);
  });

  it("supports multiple roles for the same owner", async () => {
    const writing = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const reading = new HashConfig("development", "primary_replica", {
      adapter: "sqlite3",
      database: "test/db/readonly.sqlite3",
    });
    await handler.establishConnection(writing, {
      ownerName: "primary",
      role: "writing",
    });
    await handler.establishConnection(reading, {
      ownerName: "primary",
      role: "reading",
    });
    const writingPool = handler.retrieveConnectionPool("primary", { role: "writing" });
    const readingPool = handler.retrieveConnectionPool("primary", { role: "reading" });
    expect(writingPool).toBeTruthy();
    expect(readingPool).toBeTruthy();
    expect(writingPool).not.toBe(readingPool);
    expect(writingPool!.dbConfig.database).toBe("test/db/primary.sqlite3");
    expect(readingPool!.dbConfig.database).toBe("test/db/readonly.sqlite3");
  });

  it("supports multiple shards for the same owner and role", async () => {
    const shard1 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const shard2 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/readonly.sqlite3",
    });
    await handler.establishConnection(shard1, {
      ownerName: "primary",
      shard: "one",
    });
    await handler.establishConnection(shard2, {
      ownerName: "primary",
      shard: "two",
    });
    const pool1 = handler.retrieveConnectionPool("primary", { shard: "one" });
    const pool2 = handler.retrieveConnectionPool("primary", { shard: "two" });
    expect(pool1).toBeTruthy();
    expect(pool2).toBeTruthy();
    expect(pool1).not.toBe(pool2);
  });

  it("re-establishing connection disconnects old pool", async () => {
    const config1 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const config2 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/readonly.sqlite3",
    });
    const oldPool = await handler.establishConnection(config1, {
      ownerName: "primary",
    });
    const disconnectSpy = vi.spyOn(oldPool, "disconnect");
    const newPool = await handler.establishConnection(config2, {
      ownerName: "primary",
    });
    expect(disconnectSpy).toHaveBeenCalled();
    expect(newPool).not.toBe(oldPool);
    expect(newPool.dbConfig.database).toBe("test/db/readonly.sqlite3");
    expect(handler.connectionPools).toHaveLength(1);
  });

  it("connection pool names", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    await handler.establishConnection(config, { ownerName: "primary" });
    expect(handler.connectionPoolNames()).toContain("primary");
  });

  it("each connection pool", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    await handler.establishConnection(config, { ownerName: "primary" });
    const pools: unknown[] = [];
    handler.eachConnectionPool(null, (pool) => pools.push(pool));
    expect(pools).toHaveLength(1);
  });

  it("clear active connections bang", async () => {
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    await handler.establishConnection(config, { ownerName: "primary" });
    const pool = handler.retrieveConnectionPool("primary")!;
    await pool.leaseConnection();
    expect(pool.activeConnection).toBeTruthy();
    handler.clearActiveConnectionsBang();
    expect(pool.activeConnection).toBeNull();
  });

  it("clear all connections bang", async () => {
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    await handler.establishConnection(config, { ownerName: "primary" });
    const pool = handler.retrieveConnectionPool("primary")!;
    await pool.leaseConnection();
    await handler.clearAllConnectionsBang();
    expect(pool.isConnected()).toBe(false);
  });

  it("prevent writes", async () => {
    expect(handler.preventWrites).toBeNull();
    handler.preventWrites = true;
    expect(handler.preventWrites).toBe(true);
    handler.preventWrites = false;
  });

  it("retrieve connection strict throws for missing pool", async () => {
    expect(() => handler.retrieveConnection("nonexistent")).toThrow(/No database connection/);
  });

  it("is connected", async () => {
    expect(handler.isConnected("primary")).toBe(false);
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    await handler.establishConnection(config, { ownerName: "primary" });
    const pool = handler.retrieveConnectionPool("primary")!;
    await (await pool.leaseConnection()).verifyBang();
    expect(handler.isConnected("primary")).toBe(true);
    pool.releaseConnection();
  });

  it("remove connection pool", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    await handler.establishConnection(config, { ownerName: "primary" });
    expect(handler.retrieveConnectionPool("primary")).toBeTruthy();
    await handler.removeConnectionPool("primary");
    expect(handler.retrieveConnectionPool("primary")).toBeUndefined();
  });

  it("flush idle connections bang", async () => {
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    await handler.establishConnection(config, { ownerName: "primary" });
    const pool = handler.retrieveConnectionPool("primary")!;
    await pool.leaseConnection();
    pool.releaseConnection();
    expect(pool.stat().idle).toBe(1);
    await handler.flushIdleConnectionsBang();
    expect(pool.stat().connections).toBe(0);
  });

  it("connection pool list filtered by role", async () => {
    const config1 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const config2 = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/readonly.sqlite3",
    });
    await handler.establishConnection(config1, {
      ownerName: "primary",
      role: "writing",
    });
    await handler.establishConnection(config2, {
      ownerName: "primary",
      role: "reading",
    });
    expect(handler.connectionPoolList("writing")).toHaveLength(1);
    expect(handler.connectionPoolList("reading")).toHaveLength(1);
    expect(handler.connectionPoolList("all")).toHaveLength(2);
    expect(handler.connectionPoolList()).toHaveLength(2);
  });

  it("active connections filtered by role", async () => {
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    await handler.establishConnection(config, {
      ownerName: "primary",
      role: "writing",
    });
    const pool = handler.retrieveConnectionPool("primary", { role: "writing" })!;
    await pool.leaseConnection();
    expect(handler.hasActiveConnections("writing")).toBe(true);
    expect(handler.hasActiveConnections("reading")).toBe(false);
    pool.releaseConnection();
  });

  it("retrieve connection pool strict mode with role and shard", async () => {
    expect(() =>
      handler.retrieveConnectionPool("primary", {
        role: "reading",
        shard: "shard_one",
        strict: true,
      }),
    ).toThrow(/No database connection defined.*'shard_one' shard.*'reading' role/);
  });

  it("re-establishing with same config object returns existing pool without disconnect", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const pool1 = await handler.establishConnection(config, {
      ownerName: "primary",
    });
    const disconnectSpy = vi.spyOn(pool1, "disconnect");
    const pool2 = await handler.establishConnection(config, {
      ownerName: "primary",
    });
    expect(disconnectSpy).not.toHaveBeenCalled();
    expect(pool2).toBe(pool1);
  });

  it("re-establishing with same config and clobber true disconnects old pool", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    const pool1 = await handler.establishConnection(config, {
      ownerName: "primary",
    });
    const disconnectSpy = vi.spyOn(pool1, "disconnect");
    const pool2 = await handler.establishConnection(config, {
      ownerName: "primary",
      clobber: true,
    });
    expect(disconnectSpy).toHaveBeenCalled();
    expect(pool2).not.toBe(pool1);
  });

  it("clear all connections bang is safe on empty handler", async () => {
    await expect(handler.clearAllConnectionsBang()).resolves.toBeUndefined();
  });

  it("flush idle connections bang is safe on empty handler", async () => {
    await expect(handler.flushIdleConnectionsBang()).resolves.toBeUndefined();
  });

  it("clear active connections bang is safe on empty handler", async () => {
    expect(() => handler.clearActiveConnectionsBang()).not.toThrow();
  });

  it("retrieve connection pool strict mode raises with role in message", async () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "test/db/primary.sqlite3",
    });
    await handler.establishConnection(config, {
      ownerName: "primary",
      role: "writing",
    });
    expect(() =>
      handler.retrieveConnectionPool("primary", { role: "reading", strict: true }),
    ).toThrow(/No database connection defined.*'reading' role/);
  });
});
