import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertRaises, assertRespondTo } from "@blazetrails/activesupport/testing/assertions";
import { NotImplementedError, Thread } from "@blazetrails/ruby-compat";
import { Executor } from "@blazetrails/activesupport";
import { BodyProxy } from "@blazetrails/rack";
import { Base } from "../../lib/index.js";
import { QueryCache } from "../../lib/query-cache.js";
import { AsynchronousQueriesTracker } from "../../lib/asynchronous-queries-tracker.js";
import { ConnectionPool } from "../../lib/connection-adapters/abstract/connection-pool.js";
import { FutureResult } from "../../lib/future-result.js";
import { itIfSupports } from "../support/supports.js";

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

function middleware(app: RackApp): (env: Record<string, unknown>) => Promise<RackResponse> {
  return async (env) => {
    const [a, b, c] = await executor().wrap(() => app.call(env));
    return [a, b, new BodyProxy(c, () => {})];
  };
}

describe("ConnectionManagementTest", () => {
  let env: Record<string, unknown>;
  let app: App;
  let management: (env: Record<string, unknown>) => Promise<RackResponse>;

  beforeEach(async () => {
    env = {};
    app = new App();
    management = middleware(app);

    expect(await Base.leaseConnection()).toBeTruthy();
    expect(Base.connectionHandler.hasActiveConnections("all")).toBeTruthy();
  });

  afterEach(async () => {
    await Base.connectionHandler.clearAllConnectionsBang();
  });

  it("app delegation", async () => {
    const manager = middleware(app);

    await manager(env);
    expect(app.calls).toEqual([env]);
  });

  it("body responds to each", async () => {
    const [, , body] = await management(env);
    const bits: unknown[] = [];
    (body as BodyProxy).each((bit) => bits.push(bit));
    expect(bits).toEqual(["hi mom"]);
  });

  it("connections are cleared after body close", async () => {
    const [, , body] = await management(env);
    (body as BodyProxy).close();
    expect(Base.connectionHandler.hasActiveConnections("all")).toBeFalsy();
  });

  it("connections are cleared even if inside a non-joinable transaction", async () => {
    await Base.connectionPool().pinConnectionBang(true);
    try {
      await new Thread(async () => {
        expect(await Base.leaseConnection()).toBeTruthy();
        expect(Base.connectionHandler.hasActiveConnections("all")).toBeTruthy();
        const [, , body] = await management(env);
        (body as BodyProxy).close();
        expect(Base.connectionHandler.hasActiveConnections("all")).toBeFalsy();
      }).join();
    } finally {
      await Base.connectionPool().unpinConnectionBang();
    }
  });

  it("active connections are not cleared on body close during transaction", async () => {
    await Base.transaction(async () => {
      const [, , body] = await management(env);
      (body as BodyProxy).close();
      expect(Base.connectionHandler.hasActiveConnections("all")).toBeTruthy();
    });
  });

  it("connections closed if exception", async () => {
    class Explosive extends App {
      override call(): RackResponse {
        throw new Error("NotImplementedError");
      }
    }
    const explosive = middleware(new Explosive());
    await expect(explosive(env)).rejects.toThrow("NotImplementedError");
    expect(Base.connectionHandler.hasActiveConnections("all")).toBeFalsy();
  });

  it("connections not closed if exception inside transaction", async () => {
    await Base.transaction(async () => {
      class Explosive extends App {
        override call(): RackResponse {
          throw new Error("RuntimeError");
        }
      }
      const explosive = middleware(new Explosive());
      await expect(explosive(env)).rejects.toThrow("RuntimeError");
      expect(Base.connectionHandler.hasActiveConnections("all")).toBeTruthy();
    });
  });

  itIfSupports(
    "concurrent_connections",
    "cancel asynchronous queries if an exception is raised",
    async () => {
      const connection = await Base.leaseConnection();
      class Explosive extends App {
        futureResult!: FutureResult;

        override call(): RackResponse {
          this.futureResult = connection.selectAll("SELECT * FROM does_not_exists", null, [], {
            async: true,
          }) as unknown as FutureResult;
          throw new NotImplementedError();
        }
      }
      const app = new Explosive();

      const explosive = middleware(app);
      await assertRaises([NotImplementedError], {}, () => explosive(env));

      await assertRaises([FutureResult.Canceled], {}, () => app.futureResult.toArray());
    },
  );

  it("doesn't clear active connections when running in a test case", async () => {
    await executor().wrap(async () => {
      await management(env);
      expect(Base.connectionHandler.hasActiveConnections("all")).toBeTruthy();
    });
  });

  it("proxy is polite to its body and responds to it", async () => {
    const body = { toPath: () => "/path" };
    const innerApp: RackApp = { call: () => [200, {}, body] };
    const responseBody = (await middleware(innerApp)(env))[2] as BodyProxy;
    assertRespondTo(responseBody, "toPath");
    expect((responseBody as unknown as { toPath(): string }).toPath()).toEqual("/path");
  });

  it("doesn't mutate the original response", async () => {
    const originalResponse: RackResponse = [200, {}, "hi"];
    const innerApp: RackApp = { call: () => originalResponse };
    await middleware(innerApp)(env);
    expect(originalResponse[2]).toBe("hi");
  });
});
