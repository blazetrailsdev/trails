import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "./base.js";
import {
  ConnectionManagement,
  BodyProxy,
  type RackApp,
  type RackResponse,
} from "./connection-adapters/connection-management.js";

class App implements RackApp {
  calls: Record<string, unknown>[] = [];

  call(env: Record<string, unknown>): RackResponse {
    this.calls.push(env);
    return [200, {}, ["hi mom"]];
  }
}

function middleware(app: RackApp): ConnectionManagement {
  return new ConnectionManagement(app);
}

describe("ConnectionManagementTest", () => {
  let env: Record<string, unknown>;
  let app: App;
  let management: ConnectionManagement;

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
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — Thread
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
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — FutureResult
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
