import { describe, it } from "vitest";
import { Duration, MemoryStore } from "@blazetrails/activesupport";
import {
  assert,
  assertEqual,
  assertNil,
  assertNot,
  assertNotEqual,
  assertNotNil,
} from "@blazetrails/activesupport/testing/assertions";
import { Store } from "@blazetrails/activesupport/cache/store";
import type { Entry } from "@blazetrails/activesupport/cache/entry";
import { LocalCache } from "@blazetrails/activesupport/cache/strategy/local-cache";
import { MockRequest, type RackApp } from "@blazetrails/rack";
import { SessionId } from "@blazetrails/rack-session";
import {
  constSet,
  include,
  rbObjRespondTo,
  type Included,
  prepend,
  rbInspect,
  Thread,
  TopLevel,
} from "@blazetrails/ruby-compat";
import { Base } from "../../../../lib/action-controller/base.js";
import { deprecator } from "../../../../lib/action-dispatch/deprecator.js";
import { CacheStore } from "../../../../lib/action-dispatch/middleware/session/cache-store.js";
import { ShowExceptions } from "../../../../lib/action-dispatch/middleware/show-exceptions.js";
import type { RouteSet } from "../../../../lib/action-dispatch/routing/route-set.js";
import {
  IntegrationTest,
  type RoutesApp,
} from "../../../../lib/action-dispatch/testing/integration.js";
import { CookieAssertions } from "../../../support/abstract-unit.js";

class LocallyCachedStore extends Store {
  static {
    prepend(this, LocalCache);
  }

  declare _data: Record<string, unknown>;

  constructor() {
    super();
    this._data = {};
  }

  protected async readEntry(key: string, options: Record<string, unknown>): Promise<Entry | null> {
    return this.deserializeEntry(await this.readSerializedEntry(key, options));
  }

  protected async readSerializedEntry(key: string, _options?: unknown): Promise<unknown> {
    return this._data[key];
  }

  protected async writeEntry(
    key: string,
    entry: Entry,
    options: Record<string, unknown>,
  ): Promise<boolean> {
    this._data[key] = this.serializeEntry(entry, options);
    return true;
  }

  protected async deleteEntry(key: string, _options: Record<string, unknown>): Promise<boolean> {
    const existed = Object.hasOwn(this._data, key);
    delete this._data[key];
    return existed;
  }
}

class TestController extends Base {
  async noSessionAccess(): Promise<void> {
    await this.head(":ok");
  }

  async setSessionValue(): Promise<void> {
    await this.session.set("foo", "bar");
    await this.head(":ok");
  }

  async getSessionValue(): Promise<void> {
    await this.render({ plain: `foo: ${rbInspect(await this.session.get("foo"))}` });
  }

  async getSessionId(): Promise<void> {
    await this.render({ plain: `${(this.request.session.id() as SessionId).publicId}` });
  }

  async readSessionWhileAnotherRequestLogsOut(): Promise<void> {
    await this.session.get("foo");
    await CacheStoreTest.logOut(this.request);
    await this.head(":ok");
  }

  async writeSessionWhileAnotherRequestLogsOut(): Promise<void> {
    await this.session.get("foo");
    await CacheStoreTest.logOut(this.request);
    await this.session.set("foo", "baz");
    await this.head(":ok");
  }

  async getResetSessionValue(): Promise<void> {
    await this.render({ plain: `bar: ${rbInspect(await this.session.get("bar"))}` });
  }

  async callResetSession(): Promise<void> {
    await this.session.get("bar");
    await this.resetSession();
    await this.session.set("bar", "baz");
    await this.head(":ok");
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class CacheStoreTest extends IntegrationTest {
  static TestController = TestController;

  static appUnderTest: RoutesApp;

  declare _cache: MemoryStore | LocallyCachedStore;
  declare _cookieOptions?: Record<string, unknown>;

  static async logOut(request: { getHeader(name: string): unknown }): Promise<void> {
    const cookie = request.getHeader("HTTP_COOKIE");
    await new Thread(() =>
      new MockRequest(CacheStoreTest.appUnderTest as unknown as RackApp).get("/callResetSession", {
        HTTP_COOKIE: cookie,
      }),
    ).join();
  }

  cookieOptions(options: Record<string, unknown> = {}): Record<string, unknown> {
    return Object.assign((this._cookieOptions ??= {}), options);
  }

  override get app(): RoutesApp {
    return (this._app ??= CacheStoreTest.appUnderTest =
      IntegrationTest.buildApp(null, (middleware) => {
        this._cache ??= new MemoryStore();
        if (rbObjRespondTo(this._cache, "middleware")) {
          middleware.use((this._cache as unknown as { middleware(): never }).middleware());
        }
        middleware.use(CacheStore, {
          key: "_session_id",
          cache: this._cache,
          ...this.cookieOptions(),
        });
        middleware.delete(ShowExceptions);
      }));
  }

  override set app(value: unknown) {
    super.app = value;
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface CacheStoreTest extends Included<typeof CookieAssertions> {}
include(CacheStoreTest, CookieAssertions);
constSet(TopLevel, "CacheStoreTest", CacheStoreTest);

describe("CacheStoreTest", () => {
  it("setting and getting session value", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertResponse(":success");
      assert(t.cookies.get("_session_id"));

      await t.get("/getSessionValue");
      t.assertResponse(":success");
      assertEqual('foo: "bar"', t.response.body);
    });
  });

  it("getting nil session value", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/getSessionValue");
      t.assertResponse(":success");
      assertEqual("foo: nil", t.response.body);
    });
  });

  it("getting session value after session reset", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertResponse(":success");
      assert(t.cookies.get("_session_id"));
      const sessionCookie = t.cookies.getCookie("_session_id")!;

      await t.get("/callResetSession");
      t.assertResponse(":success");
      assertNotEqual([], t.headers!.get("Set-Cookie"));

      t.cookies.push(sessionCookie);

      await t.get("/getSessionValue");
      t.assertResponse(":success");
      assertEqual(
        "foo: nil",
        t.response.body,
        "data for this session should have been obliterated from cache",
      );
    });
  });

  it("session logged out during a request stays logged out", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    t._cache = new LocallyCachedStore();

    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      const sessionCookie = t.cookies.getCookie("_session_id")!;

      await t.get("/readSessionWhileAnotherRequestLogsOut");
      t.assertResponse(":success");

      t.cookies.push(sessionCookie);

      await t.get("/getSessionValue");
      assertEqual("foo: nil", t.response.body);
    });
  });

  it("session logged out during a writing request stays logged out", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    t._cache = new LocallyCachedStore();

    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      const sessionCookie = t.cookies.getCookie("_session_id")!;

      await t.get("/writeSessionWhileAnotherRequestLogsOut");
      t.assertResponse(":success");

      t.cookies.push(sessionCookie);

      await t.get("/getSessionValue");
      assertEqual("foo: nil", t.response.body);
    });
  });

  it("session logged out during a request does not resend its cookie", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    t._cache = new LocallyCachedStore();
    t.cookieOptions({ expireAfter: Duration.hours(1) });

    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");

      await t.get("/readSessionWhileAnotherRequestLogsOut");
      t.assertResponse(":success");
      assertNil(t.headers!.get("Set-Cookie"));
    });
  });

  it("session reset by the request is saved under the new id", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      const oldSessionId = t.cookies.get("_session_id");

      await t.get("/callResetSession");
      t.assertResponse(":success");
      assertNotEqual(oldSessionId, t.cookies.get("_session_id"));

      await t.get("/getResetSessionValue");
      assertEqual('bar: "baz"', t.response.body);
    });
  });

  it("getting from nonexistent session", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/getSessionValue");
      t.assertResponse(":success");
      assertEqual("foo: nil", t.response.body);
      assertNil(t.cookies.get("_session_id"), "should only create session on write, not read");
    });
  });

  it("setting session value after session reset", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertResponse(":success");
      assert(t.cookies.get("_session_id"));
      const sessionId = t.cookies.get("_session_id");

      await t.get("/callResetSession");
      t.assertResponse(":success");
      assertNotEqual([], t.headers!.get("Set-Cookie"));
      assertNotNil(t.headers!.get("Set-Cookie"));

      await t.get("/getSessionValue");
      t.assertResponse(":success");
      assertEqual("foo: nil", t.response.body);

      await t.get("/getSessionId");
      t.assertResponse(":success");
      assertNotEqual(sessionId, t.response.body);
    });
  });

  it("getting session id", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertResponse(":success");
      assert(t.cookies.get("_session_id"));
      const sessionId = t.cookies.get("_session_id");

      await t.get("/getSessionId");
      t.assertResponse(":success");
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
      t.assertResponse(":success");
      assert(t.cookies.get("_session_id"));

      await t.get("/getSessionValue");
      t.assertResponse(":success");
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

      t.assertResponse(":success");
      assertNotNil(t.cookies.get("_session_id"));
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
      t.assertResponse(":success");
      assert(t.cookies.get("_session_id"));

      const sid = new SessionId(t.cookies.get("_session_id")!);
      const session = await t._cache.read(`_session_id:${sid.privateId}`);
      await t._cache.delete(`_session_id:${sid.privateId}`);
      await t._cache.write(`_session_id:${sid.publicId}`, session);

      await t.get("/getSessionValue");
      t.assertResponse(":success");
      assertEqual('foo: "bar"', t.response.body);
    });
  });

  it("session read by legacy id is saved under private id", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      const sid = new SessionId(t.cookies.get("_session_id")!);
      await t._cache.write(
        `_session_id:${sid.publicId}`,
        await t._cache.read(`_session_id:${sid.privateId}`),
      );
      await t._cache.delete(`_session_id:${sid.privateId}`);

      await t.get("/getSessionValue");
      assertEqual({ foo: "bar" }, await t._cache.read(`_session_id:${sid.privateId}`));
    });
  });

  it("drop session in the legacy id as well", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertResponse(":success");
      assert(t.cookies.get("_session_id"));

      const sid = new SessionId(t.cookies.get("_session_id")!);
      const session = await t._cache.read(`_session_id:${sid.privateId}`);
      await t._cache.delete(`_session_id:${sid.privateId}`);
      await t._cache.write(`_session_id:${sid.publicId}`, session);

      await t.get("/callResetSession");
      t.assertResponse(":success");
      assertNotEqual([], t.headers!.get("Set-Cookie"));

      assertNil(await t._cache.read(`_session_id:${sid.privateId}`));
      assertNil(await t._cache.read(`_session_id:${sid.publicId}`));
    });
  });

  it("cookie only false reads session id from params", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    t.cookieOptions({ cookieOnly: false });

    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertResponse(":success");
      const sessionId = t.cookies.get("_session_id");

      t.resetBang();

      await t.get("/getSessionValue", { params: { _session_id: sessionId } });
      t.assertResponse(":success");
      assertEqual('foo: "bar"', t.response.body);
    });
  });

  it("same site in subclass default options wins over default", async ({ testCase }) => {
    const t = testCase as CacheStoreTest;
    const storeClass = class extends CacheStore {
      static override DEFAULT_OPTIONS = Object.freeze({
        ...CacheStore.DEFAULT_OPTIONS,
        sameSite: ":strict",
      });
    };
    t.app = IntegrationTest.buildApp(null, (middleware) => {
      middleware.use(storeClass, { key: "_session_id", cache: new MemoryStore() });
      middleware.delete(ShowExceptions);
    });

    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertSetCookieAttributes("_session_id", "SameSite=Strict");
    });
  });

  it("initialize does not add same site to the callers options", () => {
    const options = { cache: new MemoryStore() };
    new CacheStore(async () => [200, {}, []], options);

    assertNot(Object.hasOwn(options, "sameSite"));
  });
});
