import { describe, expect, it } from "vitest";
import { onLoad } from "@blazetrails/activesupport";
import { ActionCable } from "../index.js";
import { Base } from "./base.js";
import { Configuration } from "./configuration.js";

function setup() {
  const log: string[] = [];
  const config = new Configuration();
  class FakeConnection {
    static identifiers = new Set(["user"]);
    constructor(
      readonly server: Base,
      readonly env: Record<string, unknown>,
    ) {}
    process() {
      return [101, {}, ["processed"]];
    }
    close({ reason }: { reason: string }) {
      log.push(`close:${reason}`);
    }
  }
  config.connectionClass = () => FakeConnection;
  config.pubsubAdapter = () =>
    class {
      async shutdown() {
        await Promise.resolve();
        log.push("pubsub.shutdown");
      }
      broadcast() {}
    };
  const server = new Base({ config });
  return { server, log, config, FakeConnection };
}

describe("ActionCable::Server::Base", () => {
  it("answers the health check app at its path", () => {
    const { server, config } = setup();
    config.healthCheckPath = "/up";
    config.healthCheckApplication = () => [200, {}, ["ok"]];
    expect(server.call({ PATH_INFO: "/up" })).toEqual([200, {}, ["ok"]]);
  });

  it("builds a connection and returns its process result", () => {
    const { server } = setup();
    expect(server.call({ PATH_INFO: "/cable" })).toEqual([101, {}, ["processed"]]);
    expect(server.connectionIdentifiers).toEqual(new Set(["user"]));
  });

  it("restart closes connections, halts the pool and shuts pubsub down", async () => {
    const { server, log, FakeConnection } = setup();
    server.addConnection(new FakeConnection(server, {}) as never);
    const pool = server.workerPool;
    const halt = pool.halt.bind(pool);
    pool.halt = () => {
      log.push("halt");
      halt();
    };
    void server.pubsub;
    await server.restart();
    expect(log).toEqual(["close:server_restart", "halt", "pubsub.shutdown"]);
    expect(server.workerPool).not.toBe(pool);
  });

  it("runs the action_cable load hooks with the configuration", () => {
    let base: unknown;
    onLoad("action_cable", (b: unknown) => {
      base = b;
    });
    expect(base).toBe(Base.config);
    expect(ActionCable.server()).toBeInstanceOf(Base);
  });
});
