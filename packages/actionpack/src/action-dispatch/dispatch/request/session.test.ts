import { describe, it, expect } from "vitest";
import { Options, Session, type SessionStore } from "../../request/session.js";
import { assertEmpty, assertEqual, assertNil, MemoryStore } from "@blazetrails/activesupport";
import {
  bodyFromString,
  Lint,
  Request as RackRequest,
  type RackEnv,
  type RackResponse,
} from "@blazetrails/rack";
import { RouteSet } from "../../routing/route-set.js";
import { IntegrationTest } from "../../testing/integration.js";
import { RoutedRackApp } from "../../../test-helpers/abstract-unit.js";
import { CacheStore } from "../../middleware/session/cache-store.js";
import type { MiddlewareFactory } from "../../middleware/stack.js";

function makeStore(opts: { exists?: boolean; data?: Record<string, unknown> } = {}): SessionStore {
  const exists = opts.exists ?? true;
  const data = opts.data ?? {};
  return {
    loadSession() {
      return [1, { ...data }];
    },
    sessionExists() {
      return exists;
    },
    async deleteSession() {
      return 123;
    },
    extractSessionId() {
      return 1;
    },
  };
}

function makeReq(): { env: Record<string, unknown> } {
  return { env: {} };
}

describe("Request", () => {
  describe("SessionTest", () => {
    it("create adds itself to env", async () => {
      const req = makeReq();
      const s = await Session.create(makeStore(), req, {});
      expect(s).toBe(req.env["rack.session"]);
    });

    it("to hash", async () => {
      const req = makeReq();
      const s = await Session.create(makeStore(), req, {});
      s.set("foo", "bar");
      expect(s.get("foo")).toBe("bar");
      expect(s.toHash()).toEqual({ foo: "bar" });
      expect(s.toH()).toEqual({ foo: "bar" });
    });

    it("create merges old", async () => {
      const req = makeReq();
      const s = await Session.create(makeStore(), req, {});
      s.set("foo", "bar");

      const s1 = await Session.create(makeStore(), req, {});
      expect(s1).not.toBe(s);
      expect(s1.get("foo")).toBe("bar");
    });

    it("find", async () => {
      const req = makeReq();
      assertNil(Session.find(req));

      const s = await Session.create(makeStore(), req, {});
      expect(Session.find(req)).toBe(s);
    });

    it("destroy", async () => {
      const req = makeReq();
      const s = await Session.create(makeStore(), req, {});
      s.set("rails", "ftw");
      await s.destroy();
      await assertEmpty(s);
    });

    it("store", async () => {
      const req = makeReq();
      const s = await Session.create(makeStore(), req, {});
      s.store("foo", "bar");
      expect(s.get("foo")).toBe("bar");
    });

    it("keys", async () => {
      const req = makeReq();
      const s = await Session.create(makeStore(), req, {});
      s.set("rails", "ftw");
      s.set("adequate", "awesome");
      expect(s.keys).toEqual(["rails", "adequate"]);
    });

    it("keys with deferred loading", async () => {
      const req = makeReq();
      const s = await Session.create(makeStore({ data: { sample_key: "sample_value" } }), req, {});
      expect(s.keys).toEqual(["sample_key"]);
    });

    it("values", async () => {
      const req = makeReq();
      const s = await Session.create(makeStore(), req, {});
      s.set("rails", "ftw");
      s.set("adequate", "awesome");
      expect(s.values).toEqual(["ftw", "awesome"]);
    });

    it("values with deferred loading", async () => {
      const req = makeReq();
      const s = await Session.create(makeStore({ data: { sample_key: "sample_value" } }), req, {});
      expect(s.values).toEqual(["sample_value"]);
    });

    it("clear", async () => {
      const req = makeReq();
      const s = await Session.create(makeStore(), req, {});
      s.set("rails", "ftw");
      s.set("adequate", "awesome");
      s.clear();
      assertEmpty(s.values);
    });

    it("update", async () => {
      const req = makeReq();
      const s = await Session.create(makeStore(), req, {});
      s.set("rails", "ftw");
      s.update({ rails: "awesome" });
      expect(s.keys).toEqual(["rails"]);
      expect(s.get("rails")).toBe("awesome");
    });

    it("delete", async () => {
      const req = makeReq();
      const s = await Session.create(makeStore(), req, {});
      s.set("rails", "ftw");
      s.delete("rails");
      assertEmpty(s.keys);
    });

    it("fetch", async () => {
      const req = makeReq();
      const s = await Session.create(makeStore(), req, {});
      s.set("one", "1");
      expect(s.fetch("one")).toBe("1");
      expect(s.fetch("two", "2")).toBe("2");
      assertNil(s.fetch("two", null));
      expect(s.fetch("three", undefined, (el: string) => el.toString())).toBe("three");
      expect(() => s.fetch("three")).toThrow();
    });

    it("dig", async () => {
      const req = makeReq();
      const s = await Session.create(makeStore(), req, {});
      s.set("one", { two: "3" });
      assertEqual("3", s.dig("one", "two"));
      assertEqual("3", s.dig("one", "two"));

      assertNil(s.dig("three", "two"));
      assertNil(s.dig("one", "three"));
    });

    it("id was for new session that does not exist", async () => {
      const req = makeReq();
      const s = await Session.create(makeStore({ exists: false }), req, {});
      assertNil(s.idWas());
    });

    it("id was for session that does not exist after writing", async () => {
      const req = makeReq();
      const s = await Session.create(makeStore({ exists: false }), req, {});
      s.set("one", "1");
      assertNil(s.idWas());
    });

    it("id was for session that does not exist after destroying", async () => {
      const req = makeReq();
      const s = await Session.create(makeStore({ exists: false }), req, {});
      await s.destroy();
      assertNil(s.idWas());
    });

    it("id was for existing session", async () => {
      const req = makeReq();
      const s = await Session.create(makeStore(), req, {});
      expect(s.idWas()).toBe(1);
    });

    it("id was for existing session after write", async () => {
      const req = makeReq();
      const s = await Session.create(makeStore(), req, {});
      s.set("one", "1");
      expect(s.idWas()).toBe(1);
    });

    it("id was for existing session after destroy", async () => {
      const req = makeReq();
      const s = await Session.create(makeStore(), req, {});
      await s.destroy();
      expect(s.idWas()).toBe(1);
    });
  });

  describe("SessionIntegrationTest", () => {
    class MySessionApp {
      call(env: RackEnv): RackResponse {
        const request = new RackRequest(env);
        (request.session as Session).set("hello", "Hello from MySessionApp!");
        return [200, {}, bodyFromString("Hello from MySessionApp!")];
      }
    }

    const Router = new RouteSet();
    Router.draw(function () {
      this.get({ "/mysessionapp": new MySessionApp() });
    });

    class SessionIntegrationTest extends IntegrationTest {
      declare cache: MemoryStore;

      override get app(): unknown {
        return (this._app ??= new RoutedRackApp(Router, (middleware) => {
          this.cache = new MemoryStore();
          middleware.use(CacheStore as MiddlewareFactory, {
            key: "_session_id",
            cache: this.cache,
          });
          middleware.use(Lint as unknown as MiddlewareFactory);
        }));
      }

      override set app(value: unknown) {
        this._app = value;
      }
    }

    it("session follows rack api contract 1", async () => {
      const testCase = new SessionIntegrationTest(expect.getState().currentTestName!);
      await testCase.get("/mysessionapp");
      testCase.assertResponse("ok");
      assertEqual("Hello from MySessionApp!", testCase.response.body);
      assertEqual("Hello from MySessionApp!", testCase.session().get("hello"));
    });
  });
});

describe("Options", () => {
  it("create stores an Options instance", async () => {
    const req = makeReq();
    await Session.create(makeStore(), req, { key: "_session_id" });
    const options = Options.find(req);
    expect(options).toBeInstanceOf(Options);
    expect((options as Options).get("key")).toBe("_session_id");
    expect((options as Options).toHash()).toEqual({ key: "_session_id" });
  });

  it("disabled stores an Options instance whose id is nil", async () => {
    const req = makeReq();
    Session.disabled(req);
    expect((Options.find(req) as Options).id(req)).toBeNull();
  });

  it("id falls back to the store when no id is stored", async () => {
    const req = makeReq();
    const options = new Options(makeStore(), {});
    expect(options.id(req)).toBe(1);
  });

  it("[]= writes through and values_at reads back", async () => {
    const options = new Options(null, { key: "_session_id" });
    options.set("secure", true);
    expect(options.valuesAt("key", "secure")).toEqual(["_session_id", true]);
  });
});
