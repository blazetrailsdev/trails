import { describe, it, expect } from "vitest";
import { Options, Session, type SessionStore } from "../../request/session.js";
import { assertEqual, assertNil, MemoryStore } from "@blazetrails/activesupport";
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
    deleteSession() {
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
    it("create adds itself to env", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req, {});
      expect(s).toBe(req.env["rack.session"]);
    });

    it("to hash", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req, {});
      s.set("foo", "bar");
      expect(s.get("foo")).toBe("bar");
      expect(s.toHash()).toEqual({ foo: "bar" });
      expect(s.toH()).toEqual({ foo: "bar" });
    });

    it("create merges old", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req, {});
      s.set("foo", "bar");

      const s1 = Session.create(makeStore(), req, {});
      expect(s1).not.toBe(s);
      expect(s1.get("foo")).toBe("bar");
    });

    it("find", () => {
      const req = makeReq();
      assertNil(Session.find(req));

      const s = Session.create(makeStore(), req, {});
      expect(Session.find(req)).toBe(s);
    });

    it("destroy", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req, {});
      s.set("rails", "ftw");
      s.destroy();
      expect(s.isEmpty()).toBe(true);
    });

    it("store", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req, {});
      s.store("foo", "bar");
      expect(s.get("foo")).toBe("bar");
    });

    it("keys", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req, {});
      s.set("rails", "ftw");
      s.set("adequate", "awesome");
      expect(s.keys).toEqual(["rails", "adequate"]);
    });

    it("keys with deferred loading", () => {
      const req = makeReq();
      const s = Session.create(makeStore({ data: { sample_key: "sample_value" } }), req, {});
      expect(s.keys).toEqual(["sample_key"]);
    });

    it("values", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req, {});
      s.set("rails", "ftw");
      s.set("adequate", "awesome");
      expect(s.values).toEqual(["ftw", "awesome"]);
    });

    it("values with deferred loading", () => {
      const req = makeReq();
      const s = Session.create(makeStore({ data: { sample_key: "sample_value" } }), req, {});
      expect(s.values).toEqual(["sample_value"]);
    });

    it("clear", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req, {});
      s.set("rails", "ftw");
      s.set("adequate", "awesome");
      s.clear();
      expect(s.values).toEqual([]);
    });

    it("update", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req, {});
      s.set("rails", "ftw");
      s.update({ rails: "awesome" });
      expect(s.keys).toEqual(["rails"]);
      expect(s.get("rails")).toBe("awesome");
    });

    it("delete", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req, {});
      s.set("rails", "ftw");
      s.delete("rails");
      expect(s.keys).toEqual([]);
    });

    it("fetch", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req, {});
      s.set("one", "1");
      expect(s.fetch("one")).toBe("1");
      expect(s.fetch("two", "2")).toBe("2");
      assertNil(s.fetch("two", null));
      expect(s.fetch("three", undefined, (el: string) => el.toString())).toBe("three");
      expect(() => s.fetch("three")).toThrow();
    });

    it("dig", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req, {});
      s.set("one", { two: "3" });
      expect(s.dig("one", "two")).toBe("3");
      expect(s.dig("three", "two")).toBeUndefined();
      expect(s.dig("one", "three")).toBeUndefined();
    });

    it("id was for new session that does not exist", () => {
      const req = makeReq();
      const s = Session.create(makeStore({ exists: false }), req, {});
      assertNil(s.idWas());
    });

    it("id was for session that does not exist after writing", () => {
      const req = makeReq();
      const s = Session.create(makeStore({ exists: false }), req, {});
      s.set("one", "1");
      assertNil(s.idWas());
    });

    it("id was for session that does not exist after destroying", () => {
      const req = makeReq();
      const s = Session.create(makeStore({ exists: false }), req, {});
      s.destroy();
      assertNil(s.idWas());
    });

    it("id was for existing session", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req, {});
      expect(s.idWas()).toBe(1);
    });

    it("id was for existing session after write", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req, {});
      s.set("one", "1");
      expect(s.idWas()).toBe(1);
    });

    it("id was for existing session after destroy", () => {
      const req = makeReq();
      const s = Session.create(makeStore(), req, {});
      s.destroy();
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
      const t = new SessionIntegrationTest(expect.getState().currentTestName!);
      await t.get("/mysessionapp");
      t.assertResponse("ok");
      assertEqual("Hello from MySessionApp!", t.response.body);
      assertEqual("Hello from MySessionApp!", t.session().get("hello"));
    });
  });
});

describe("Options", () => {
  it("create stores an Options instance", () => {
    const req = makeReq();
    Session.create(makeStore(), req, { key: "_session_id" });
    const options = Options.find(req);
    expect(options).toBeInstanceOf(Options);
    expect((options as Options).get("key")).toBe("_session_id");
    expect((options as Options).toHash()).toEqual({ key: "_session_id" });
  });

  it("disabled stores an Options instance whose id is nil", () => {
    const req = makeReq();
    Session.disabled(req);
    expect((Options.find(req) as Options).id(req)).toBeNull();
  });

  it("id falls back to the store when no id is stored", () => {
    const req = makeReq();
    const options = new Options(makeStore(), {});
    expect(options.id(req)).toBe(1);
  });

  it("[]= writes through and values_at reads back", () => {
    const options = new Options(null, { key: "_session_id" });
    options.set("secure", true);
    expect(options.valuesAt("key", "secure")).toEqual(["_session_id", true]);
  });
});
