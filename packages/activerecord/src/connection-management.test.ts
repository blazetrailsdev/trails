import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Executor } from "@blazetrails/activesupport";
import { BodyProxy } from "@blazetrails/rack";
import { Base } from "./index.js";
import { QueryCache } from "./query-cache.js";
import { AsynchronousQueriesTracker } from "./asynchronous-queries-tracker.js";
import { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";

type RackResponse = [number, Record<string, unknown>, unknown];

interface RackApp {
  call(env: Record<string, unknown>): RackResponse;
}

class App implements RackApp {
  calls: Record<string, unknown>[] = [];

  call(env: Record<string, unknown>): RackResponse {
    this.calls.push(env);
    return [200, {}, ["hi mom"]];
  }
}

let _executor: typeof Executor | undefined;

function executor(): typeof Executor {
  if (!_executor) {
    const exe = class extends Executor {};
    QueryCache.installExecutorHooks(exe);
    AsynchronousQueriesTracker.installExecutorHooks(exe);
    ConnectionPool.installExecutorHooks(exe);
    _executor = exe;
  }
  return _executor;
}

function middleware(app: RackApp): (env: Record<string, unknown>) => RackResponse {
  return (env) => {
    const [a, b, c] = executor().wrap(() => app.call(env));
    return [a, b, new BodyProxy(c, () => {})];
  };
}

describe("ConnectionManagementTest", () => {
  let env: Record<string, unknown>;
  let app: App;
  let management: (env: Record<string, unknown>) => RackResponse;

  beforeEach(async () => {
    env = {};
    app = new App();
    management = middleware(app);

    expect(await Base.leaseConnection()).toBeTruthy();
    expect(Base.connectionHandler.activeConnectionsQ("all")).toBe(true);
  });

  afterEach(async () => {
    await Base.connectionHandler.clearAllConnectionsBang();
  });

  it("app delegation", () => {
    const manager = middleware(app);

    manager(env);
    expect(app.calls).toEqual([env]);
  });

  it("body responds to each", () => {
    const [, , body] = management(env);
    const bits: unknown[] = [];
    (body as BodyProxy).each((bit) => bits.push(bit));
    expect(bits).toEqual(["hi mom"]);
  });

  it("connections are cleared after body close", () => {
    const [, , body] = management(env);
    (body as BodyProxy).close();
    expect(Base.connectionHandler.activeConnectionsQ("all")).toBe(false);
  });

  it.skip("connections are cleared even if inside a non-joinable transaction", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — Thread
  });

  it("active connections are not cleared on body close during transaction", async () => {
    await Base.transaction(async () => {
      const [, , body] = management(env);
      (body as BodyProxy).close();
      expect(Base.connectionHandler.activeConnectionsQ("all")).toBe(true);
    });
  });

  it("connections closed if exception", () => {
    class Explosive extends App {
      override call(): RackResponse {
        throw new Error("NotImplementedError");
      }
    }
    const explosive = middleware(new Explosive());
    expect(() => explosive(env)).toThrow("NotImplementedError");
    expect(Base.connectionHandler.activeConnectionsQ("all")).toBe(false);
  });

  it("connections not closed if exception inside transaction", async () => {
    await Base.transaction(async () => {
      class Explosive extends App {
        override call(): RackResponse {
          throw new Error("RuntimeError");
        }
      }
      const explosive = middleware(new Explosive());
      expect(() => explosive(env)).toThrow("RuntimeError");
      expect(Base.connectionHandler.activeConnectionsQ("all")).toBe(true);
    });
  });

  it.skip("cancel asynchronous queries if an exception is raised", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — FutureResult
  });

  it("doesn't clear active connections when running in a test case", () => {
    executor().wrap(() => {
      management(env);
      expect(Base.connectionHandler.activeConnectionsQ("all")).toBe(true);
    });
  });

  it("proxy is polite to its body and responds to it", () => {
    const body = { toPath: () => "/path" };
    const innerApp: RackApp = { call: () => [200, {}, body] };
    const responseBody = middleware(innerApp)(env)[2] as BodyProxy;
    expect(responseBody.respondTo("toPath")).toBe(true);
    expect(responseBody.delegate("toPath")).toBe("/path");
  });

  it("doesn't mutate the original response", () => {
    const originalResponse: RackResponse = [200, {}, "hi"];
    const innerApp: RackApp = { call: () => originalResponse };
    middleware(innerApp)(env);
    expect(originalResponse[2]).toBe("hi");
  });
});
