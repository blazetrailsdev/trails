import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "./base.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import {
  ConnectionManagement,
  BodyProxy,
  type RackApp,
  type RackResponse,
} from "./connection-adapters/connection-management.js";

// Mirrors the inner `App` test double in connection_management_test.rb.
class App implements RackApp {
  calls: Record<string, unknown>[] = [];

  call(env: Record<string, unknown>): RackResponse {
    this.calls.push(env);
    return [200, {}, ["hi mom"]];
  }
}

// Mirrors the `middleware(app)` helper: wraps the app in ConnectionManagement.
function middleware(app: RackApp): ConnectionManagement {
  return new ConnectionManagement(app);
}

describe("ConnectionManagementTest", () => {
  let env: Record<string, unknown>;
  let app: App;
  let management: ConnectionManagement;

  beforeEach(() => {
    Base.connectionHandler.establishConnection(
      new HashConfig("test", "primary", {
        adapter: "sqlite3",
        database: "test.db",
        pool: 5,
        reapingFrequency: null,
      }),
      { owner: "Base" },
    );

    env = {};
    app = new App();
    management = middleware(app);

    // make sure we have an active connection
    expect(Base.leaseConnection()).toBeTruthy();
    expect(Base.connectionHandler.activeConnectionsQ("all")).toBe(true);
  });

  afterEach(() => {
    Base.connectionHandler.clearAllConnectionsBang();
  });

  it("app delegation", () => {
    const manager = middleware(app);

    manager.call(env);
    expect(app.calls).toEqual([env]);
  });

  it("body responds to each", () => {
    const [, , body] = management.call(env);
    const bits: unknown[] = [];
    (body as BodyProxy).each((bit) => bits.push(bit));
    expect(bits).toEqual(["hi mom"]);
  });

  it("connections are cleared after body close", () => {
    const [, , body] = management.call(env);
    (body as BodyProxy).close();
    expect(Base.connectionHandler.activeConnectionsQ("all")).toBe(false);
  });

  it.skip("connections are cleared even if inside a non-joinable transaction", () => {
    // BLOCKED: connection-pool — pin_connection!/unpin_connection! not yet ported (Phase 6 blocker).
    // Rails pins the connection on the main thread, then asserts a separate
    // thread's lease is cleared on body close. Unblocks when pinConnectionBang/
    // unpinConnectionBang land — see project_phase6_pin_connection_blocker.
  });

  it("active connections are not cleared on body close during transaction", async () => {
    await Base.transaction(async () => {
      const [, , body] = management.call(env);
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
    expect(() => explosive.call(env)).toThrow("NotImplementedError");
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
      expect(() => explosive.call(env)).toThrow("RuntimeError");
      expect(Base.connectionHandler.activeConnectionsQ("all")).toBe(true);
    });
  });

  it.skip("cancel asynchronous queries if an exception is raised", () => {
    // BLOCKED: load-async — asynchronous queries (select_all async:) / FutureResult not yet
    // ported. Rails asserts an in-flight async query is canceled when the app
    // raises. Unblocks with async-query support in the abstract adapter.
  });

  it("doesn't clear active connections when running in a test case", () => {
    management.call({ "rack.test": true });
    expect(Base.connectionHandler.activeConnectionsQ("all")).toBe(true);
  });

  it("proxy is polite to its body and responds to it", () => {
    const body = { toPath: () => "/path" };
    const innerApp: RackApp = { call: () => [200, {}, body] };
    const responseBody = middleware(innerApp).call(env)[2] as BodyProxy & {
      toPath(): string;
    };
    expect(responseBody.respondTo("toPath")).toBe(true);
    expect(responseBody.toPath()).toBe("/path");
  });

  it("doesn't mutate the original response", () => {
    const originalResponse: RackResponse = [200, {}, "hi"];
    const innerApp: RackApp = { call: () => originalResponse };
    middleware(innerApp).call(env);
    expect(originalResponse[2]).toBe("hi");
  });
});
