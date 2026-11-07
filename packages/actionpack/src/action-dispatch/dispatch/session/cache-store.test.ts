import { describe, it } from "vitest";
import {
  assert,
  assertEqual,
  assertNil,
  assertNotEqual,
  assertNotNil,
  MemoryStore,
} from "@blazetrails/activesupport";
import { SessionId } from "@blazetrails/rack-session";
import { constSet, rbInspect, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../../action-controller/base.js";
import { deprecator } from "../../deprecator.js";
import { CacheStore } from "../../middleware/session/cache-store.js";
import { ShowExceptions } from "../../middleware/show-exceptions.js";
import type { MiddlewareFactory } from "../../middleware/stack.js";
import type { RouteSet } from "../../routing/route-set.js";
import { IntegrationTest } from "../../testing/integration.js";
import "../../../test-helpers/abstract-unit.js";

class TestController extends Base {
  noSessionAccess(): void {
    this.head("ok");
  }

  setSessionValue(): void {
    this.session.set("foo", "bar");
    this.head("ok");
  }

  async getSessionValue(): Promise<void> {
    await this.render({ plain: `foo: ${rbInspect(this.session.get("foo"))}` });
  }

  async getSessionId(): Promise<void> {
    await this.render({ plain: `${(this.request.session.id() as SessionId).publicId}` });
  }

  async callResetSession(): Promise<void> {
    this.session.get("bar");
    await this.resetSession();
    this.session.set("bar", "baz");
    this.head("ok");
  }
}

class CacheStoreTest extends IntegrationTest {
  static TestController = TestController;

  declare _cache: MemoryStore;

  override get app(): unknown {
    return (this._app ??= IntegrationTest.buildApp(null, (middleware) => {
      this._cache = new MemoryStore();
      middleware.use(CacheStore as MiddlewareFactory, { key: "_session_id", cache: this._cache });
      middleware.delete(ShowExceptions as MiddlewareFactory);
    }));
  }

  override set app(value: unknown) {
    this._app = value;
  }

  async withTestRouteSet(block: () => Promise<void>): Promise<void> {
    await this.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        deprecator().silence(() => {
          this.get("/:action", { to: CacheStoreTest.TestController });
        });
      });

      await block();
    });
  }
}
constSet(TopLevel, "CacheStoreTest", CacheStoreTest);

describe("CacheStoreTest", () => {
  it("setting and getting session value", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertResponse("success");
      assert(t.cookies.get("_session_id"));

      await t.get("/getSessionValue");
      t.assertResponse("success");
      assertEqual('foo: "bar"', t.response.body);
    });
  });

  it("getting nil session value", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/getSessionValue");
      t.assertResponse("success");
      assertEqual("foo: nil", t.response.body);
    });
  });

  it("getting session value after session reset", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertResponse("success");
      assert(t.cookies.get("_session_id"));
      const sessionCookie = t.cookies.getCookie("_session_id")!;

      await t.get("/callResetSession");
      t.assertResponse("success");
      assertNotEqual([], t.headers!.get("Set-Cookie"));

      t.cookies.push(sessionCookie);

      await t.get("/getSessionValue");
      t.assertResponse("success");
      assertEqual(
        "foo: nil",
        t.response.body,
        "data for this session should have been obliterated from cache",
      );
    });
  });

  it("getting from nonexistent session", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/getSessionValue");
      t.assertResponse("success");
      assertEqual("foo: nil", t.response.body);
      assertNil(t.cookies.get("_session_id"), "should only create session on write, not read");
    });
  });

  it("setting session value after session reset", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertResponse("success");
      assert(t.cookies.get("_session_id"));
      const sessionId = t.cookies.get("_session_id");

      await t.get("/callResetSession");
      t.assertResponse("success");
      assertNotEqual([], t.headers!.get("Set-Cookie"));
      assertNotNil(t.headers!.get("Set-Cookie"));

      await t.get("/getSessionValue");
      t.assertResponse("success");
      assertEqual("foo: nil", t.response.body);

      await t.get("/getSessionId");
      t.assertResponse("success");
      assertNotEqual(sessionId, t.response.body);
    });
  });

  it("getting session id", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertResponse("success");
      assert(t.cookies.get("_session_id"));
      const sessionId = t.cookies.get("_session_id");

      await t.get("/getSessionId");
      t.assertResponse("success");
      assertEqual(
        sessionId,
        t.response.body,
        "should be able to read session id without accessing the session hash",
      );
    });
  });

  // PERMANENT-SKIP: `Marshal.load` names the class synchronously, and a JS read cannot run an awaited load; CLAUDE.md, "`Module#autoload` is a build step".
  it.skip("deserializes unloaded class", () => {});

  it("doesnt write session cookie if session id is already exists", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertResponse("success");
      assert(t.cookies.get("_session_id"));

      await t.get("/getSessionValue");
      t.assertResponse("success");
      assertNil(
        t.headers!.get("Set-Cookie"),
        "should not resend the cookie again if session_id cookie is already exists",
      );
    });
  });

  it("prevents session fixation", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    await t.withTestRouteSet(async () => {
      const sid = new SessionId("0xhax");
      assertNil(await t._cache.read(`_session_id:${sid.privateId}`));

      t.cookies.set("_session_id", sid.publicId);
      await t.get("/setSessionValue");

      t.assertResponse("success");
      assertNotEqual(sid.publicId, t.cookies.get("_session_id"));
      assertNil(await t._cache.read(`_session_id:${sid.privateId}`));
      assertEqual(
        { foo: "bar" },
        await t._cache.read(
          `_session_id:${new SessionId(t.cookies.get("_session_id")!).privateId}`,
        ),
      );
    });
  });

  it("can read session with legacy id", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertResponse("success");
      assert(t.cookies.get("_session_id"));

      const sid = new SessionId(t.cookies.get("_session_id")!);
      const session = await t._cache.read(`_session_id:${sid.privateId}`);
      await t._cache.delete(`_session_id:${sid.privateId}`);
      await t._cache.write(`_session_id:${sid.publicId}`, session);

      await t.get("/getSessionValue");
      t.assertResponse("success");
      assertEqual('foo: "bar"', t.response.body);
    });
  });

  it("drop session in the legacy id as well", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertResponse("success");
      assert(t.cookies.get("_session_id"));

      const sid = new SessionId(t.cookies.get("_session_id")!);
      const session = await t._cache.read(`_session_id:${sid.privateId}`);
      await t._cache.delete(`_session_id:${sid.privateId}`);
      await t._cache.write(`_session_id:${sid.publicId}`, session);

      await t.get("/callResetSession");
      t.assertResponse("success");
      assertNotEqual([], t.headers!.get("Set-Cookie"));

      assertNil(await t._cache.read(`_session_id:${sid.privateId}`));
      assertNil(await t._cache.read(`_session_id:${sid.publicId}`));
    });
  });
});
