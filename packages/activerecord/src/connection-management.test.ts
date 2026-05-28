import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "./index.js"; // registers ExecutorHooks.setConnectionHandlerResolver side-effect
import { Base } from "./base.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { createTestAdapter } from "./test-adapter.js";
import { Executor, AsynchronousQueriesTracker } from "./connection-management.js";
import { QueryCache } from "./query-cache.js";
import { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { BodyProxy } from "@blazetrails/rack";

function setupConnection() {
  const config = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database: "test.db",
    pool: 5,
    reapingFrequency: null,
  });
  Base.connectionHandler.establishConnection(config, {
    owner: "Base",
    adapterFactory: createTestAdapter,
  });
}

function makeExecutor() {
  const executor = new Executor();
  QueryCache.installExecutorHooks(executor);
  AsynchronousQueriesTracker.installExecutorHooks(executor);
  ConnectionPool.installExecutorHooks(executor);
  return executor;
}

/** mirrors Rails' private middleware() helper in ConnectionManagementTest */
function middleware(
  app: (env: Record<string, unknown>) => [number, Record<string, unknown>, unknown],
) {
  const executor = makeExecutor();
  return function (env: Record<string, unknown>): [number, Record<string, unknown>, BodyProxy] {
    const [status, headers, body] = executor.wrap(() => app(env));
    return [status, headers, new BodyProxy(body, () => {})];
  };
}

describe("ConnectionManagementTest", () => {
  let env: Record<string, unknown>;

  beforeEach(() => {
    setupConnection();
    env = {};
    Base.leaseConnection();
    expect(Base.connectionHandler.activeConnectionsQ("all")).toBe(true);
  });

  afterEach(() => {
    Base.connectionHandler.clearAllConnectionsBang();
  });

  it("app delegation", () => {
    const calls: Record<string, unknown>[][] = [];
    const mgr = middleware((e) => {
      calls.push([e]);
      return [200, {}, ["hi mom"]];
    });
    mgr(env);
    expect(calls).toEqual([[env]]);
  });

  it("body responds to each", () => {
    const management = middleware(() => [200, {}, ["hi mom"]]);
    const [, , body] = management(env);
    const bits: unknown[] = [];
    body.each((bit: unknown) => bits.push(bit));
    expect(bits).toEqual(["hi mom"]);
  });

  it("connections are cleared after body close", () => {
    const management = middleware(() => [200, {}, ["hi mom"]]);
    const [, , body] = management(env);
    body.close();
    expect(Base.connectionHandler.activeConnectionsQ("all")).toBe(false);
  });

  it("connections are cleared even if inside a non-joinable transaction", async () => {
    await Base.connectionPool().pinConnectionBang(false);
    try {
      Base.leaseConnection();
      expect(Base.connectionHandler.activeConnectionsQ("all")).toBe(true);
      const management = middleware(() => [200, {}, ["hi mom"]]);
      const [, , body] = management(env);
      body.close();
      expect(Base.connectionHandler.activeConnectionsQ("all")).toBe(false);
    } finally {
      await Base.connectionPool().unpinConnectionBang();
    }
  });

  it("active connections are not cleared on body close during transaction", async () => {
    const management = middleware(() => [200, {}, ["hi mom"]]);
    await Base.transaction(async () => {
      const [, , body] = management(env);
      body.close();
      expect(Base.connectionHandler.activeConnectionsQ("all")).toBe(true);
    });
  });

  it("connections closed if exception", () => {
    const explosive = middleware(() => {
      throw new Error("NotImplementedError");
    });
    expect(() => explosive(env)).toThrow("NotImplementedError");
    expect(Base.connectionHandler.activeConnectionsQ("all")).toBe(false);
  });

  it("connections not closed if exception inside transaction", async () => {
    const explosive = middleware(() => {
      throw new Error("RuntimeError");
    });
    await Base.transaction(async () => {
      expect(() => explosive(env)).toThrow("RuntimeError");
      expect(Base.connectionHandler.activeConnectionsQ("all")).toBe(true);
    });
  });

  it("cancel asynchronous queries if an exception is raised", () => {
    // JS adapters don't support concurrent connections; mirrors Rails skip for this case
  });

  it("doesn't clear active connections when running in a test case", () => {
    const management = middleware(() => [200, {}, ["hi mom"]]);
    makeExecutor().wrap(() => {
      management(env);
      expect(Base.connectionHandler.activeConnectionsQ("all")).toBe(true);
    });
  });

  it("proxy is polite to its body and responds to it", () => {
    const pathBody = Object.assign([""], {
      toPath() {
        return "/path";
      },
    });
    const mgr = middleware(() => [200, {}, pathBody]);
    const [, , body] = mgr(env);
    expect(body.respondTo("toPath")).toBe(true);
    expect(body.delegate("toPath")).toBe("/path");
  });

  it("doesn't mutate the original response", () => {
    const originalResponse: [number, Record<string, unknown>, string] = [200, {}, "hi"];
    const mgr = middleware(
      () => originalResponse as unknown as [number, Record<string, unknown>, unknown],
    );
    mgr(env);
    expect(originalResponse[2]).toBe("hi");
  });
});
