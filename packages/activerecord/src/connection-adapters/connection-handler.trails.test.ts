import { describe, it, expect, beforeEach } from "vitest";
import { ConnectionHandler } from "./abstract/connection-handler.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { Base } from "../base.js";
import { ambientPoolConfiguration } from "../test-adapter.js";

describe("ConnectionHandler selector defaults (trails)", () => {
  let handler: ConnectionHandler;

  beforeEach(() => {
    handler = new ConnectionHandler();
  });

  it("establish_connection defaults role to Base.current_role", () => {
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    Base.connectedTo({ role: "reading" }, () => {
      handler.establishConnection(config, { ownerName: "primary" });
    });

    expect(handler.retrieveConnectionPool("primary", { role: "reading" })).toBeTruthy();
    expect(handler.retrieveConnectionPool("primary", { role: "writing" })).toBeUndefined();
  });

  it("establish_connection defaults shard to Base.current_shard", () => {
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    Base.connectedTo({ shard: "shard_one" }, () => {
      handler.establishConnection(config, { ownerName: "primary" });
    });

    expect(handler.retrieveConnectionPool("primary", { shard: "shard_one" })).toBeTruthy();
    expect(handler.retrieveConnectionPool("primary", { shard: "default" })).toBeUndefined();
  });

  it("connected? and retrieve_connection read the current role", async () => {
    const config = new HashConfig("development", "primary", ambientPoolConfiguration());
    handler.establishConnection(config, { ownerName: "primary", role: "reading" });

    expect(handler.isConnected("primary")).toBe(false);

    await Base.connectedTo({ role: "reading" }, async () => {
      const conn = await handler.retrieveConnection("primary");
      expect(conn).toBeTruthy();
      await conn.verifyBang();
      expect(handler.isConnected("primary")).toBe(true);
    });

    handler.retrieveConnectionPool("primary", { role: "reading" })!.releaseConnection();
  });
});
