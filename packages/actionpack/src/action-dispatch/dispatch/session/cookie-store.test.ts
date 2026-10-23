import { describe, it } from "vitest";
import { KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { MessageEncryptor } from "@blazetrails/activesupport/message-encryptor";
import { RotationConfiguration } from "@blazetrails/activesupport/messages/rotation-configuration";
import {
  assertEqual,
  assertMatch,
  assertNil,
  assertNoMatch,
  assertNotEqual,
  assertNotNil,
  assertRaise,
  Duration,
  stub,
} from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { Utils } from "@blazetrails/rack";
import {
  type Hash,
  include,
  Marshal,
  rbInspect,
  rbModToS,
  rbObjClass,
  registerConstant,
  slice,
  type Included,
} from "@blazetrails/ruby-compat";
import { Base } from "../../../action-controller/base.js";
import { deprecator } from "../../deprecator.js";
import { Session } from "../../request/session.js";
import { CookieOverflow } from "../../middleware/cookies.js";
import { CookieStore } from "../../middleware/session/cookie-store.js";
import { ShowExceptions } from "../../middleware/show-exceptions.js";
import type { MiddlewareFactory } from "../../middleware/stack.js";
import type { RouteSet } from "../../routing/route-set.js";
import { IntegrationTest } from "../../testing/integration.js";
import { CookieAssertions } from "../../../test-helpers/abstract-unit.js";

const SessionKey = "_myapp_session";
const SessionSecret = "b3c631c314c0bbca50c1b2843150fe33";
const SessionSalt = "authenticated encrypted cookie";

const Generator = new KeyGenerator(SessionSecret, { iterations: 1000 });
const Rotations = new RotationConfiguration();

const SameSite = () => ":lax";

const Encryptor = new MessageEncryptor(Generator.generateKey(SessionSalt, 32) as never, {
  cipher: "aes-256-gcm",
  serializer: Marshal,
});

class TestController extends Base {
  noSessionAccess(): void {
    this.head("ok");
  }

  async persistentSessionId(): Promise<void> {
    await this.render({ plain: this.session.get("session_id") as string });
  }

  async setSessionValue(): Promise<void> {
    this.session.set("foo", "bar");
    await this.render({ body: null });
  }

  async getSessionValue(): Promise<void> {
    await this.render({ plain: `foo: ${rbInspect(this.session.get("foo"))}` });
  }

  async getSessionId(): Promise<void> {
    await this.render({
      plain: `id: ${(this.request.session.id() as { publicId: string } | null)?.publicId ?? ""}`,
    });
  }

  async getClassAfterResetSession(): Promise<void> {
    this.resetSession();
    await this.render({ plain: `class: ${rbModToS(rbObjClass(this.session))}` });
  }

  callSessionClear(): void {
    this.session.clear();
    this.head("ok");
  }

  callResetSession(): void {
    this.resetSession();
    this.head("ok");
  }

  raiseDataOverflow(): void {
    this.session.set("foo", "bye!".repeat(1024));
    this.head("ok");
  }

  async changeSessionId(): Promise<void> {
    this.request.session.options()!.set("id", null);
    await this.getSessionId();
  }

  renewSessionId(): void {
    (this.request.sessionOptions as unknown as InstanceType<typeof Session.Options>).set(
      "renew",
      true,
    );
    this.head("ok");
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class CookieStoreTest extends IntegrationTest {
  static TestController = TestController;

  declare _cookieOptions?: Record<string, unknown>;

  assertSessionCookie(attributesString: string | null, contents: Record<string, unknown>): void {
    const cookies = this.parseSetCookiesHeaders(this.headers!.get("Set-Cookie"));

    let sessionData: Hash<string, unknown> | null = null;
    const sessionCookie = cookies[SessionKey];
    if (sessionCookie) {
      if (attributesString) {
        const expectedAttributes = this.parseSetCookieAttributes(attributesString);

        for (const [key, value] of Object.entries(expectedAttributes)) {
          assertEqual(
            value,
            sessionCookie[key],
            `expected ${key} to be ${rbInspect(value)}, but was ${rbInspect(sessionCookie[key])}`,
          );
        }
      }

      const sessionValue = sessionCookie["value"] as string;
      try {
        sessionData = Encryptor.decryptAndVerify(Utils.unescape(sessionValue)) as Hash<
          string,
          unknown
        >;
      } catch {
        sessionData = null;
      }
    }

    assertNotNil(sessionData, "session failed to decrypt");
    assertEqual(Object.fromEntries(slice(sessionData!, ...Object.keys(contents))), contents);
  }

  override async get(
    path: string,
    options: Parameters<IntegrationTest["get"]>[1] = {},
  ): Promise<number> {
    options.headers ??= {};
    const config = options.headers;
    config["action_dispatch.secret_key_base"] = SessionSecret;
    config["action_dispatch.authenticated_encrypted_cookie_salt"] = SessionSalt;
    config["action_dispatch.use_authenticated_cookie_encryption"] = true;

    config["action_dispatch.key_generator"] ??= Generator;
    config["action_dispatch.cookies_rotations"] ??= Rotations;

    config["action_dispatch.cookies_same_site_protection"] ??= SameSite;

    return super.get(path, options);
  }

  cookieOptions(options: Record<string, unknown> = {}): Record<string, unknown> {
    return Object.assign((this._cookieOptions ??= { key: SessionKey }), options);
  }

  override get app(): unknown {
    return (this._app ??= IntegrationTest.buildApp(null, (middleware) => {
      middleware.use(CookieStore as MiddlewareFactory, this.cookieOptions());
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
          this.get("/:action", { to: CookieStoreTest.TestController });
        });
      });

      await block();
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface CookieStoreTest extends Included<typeof CookieAssertions> {}
include(CookieStoreTest, CookieAssertions);
registerConstant("CookieStoreTest", CookieStoreTest);

describe("CookieStoreTest", () => {
  it("setting session value", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");

      t.assertResponse("success");
      t.assertSessionCookie("path=/; HttpOnly", { foo: "bar" });
    });
  });

  it("getting session value", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      await t.get("/getSessionValue");

      t.assertResponse("success");
      assertEqual('foo: "bar"', t.response.body);
    });
  });

  it("getting session id", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      await t.get("/persistentSessionId");

      t.assertResponse("success");
      assertEqual(32, t.response.body.length);
      const sessionId = t.response.body;

      await t.get("/getSessionId");
      t.assertResponse("success");
      assertEqual(
        `id: ${sessionId}`,
        t.response.body,
        "should be able to read session id without accessing the session hash",
      );
    });
  });

  it("disregards tampered sessions", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    await t.withTestRouteSet(async () => {
      const encryptor = new MessageEncryptor("A".repeat(32), {
        cipher: "aes-256-gcm",
        serializer: Marshal,
      });

      t.cookies.set(SessionKey, encryptor.encryptAndSign({ foo: "bar", session_id: "abc" }));

      await t.get("/getSessionValue");

      t.assertResponse("success");
      assertEqual("foo: nil", t.response.body);
    });
  });

  it("does not set secure cookies over http", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    t.cookieOptions({ secure: true });

    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertResponse("success");
      assertNil(t.headers!.get("Set-Cookie"));
    });
  });

  it("properly renew cookies", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      await t.get("/persistentSessionId");
      const sessionId = t.response.body;
      await t.get("/renewSessionId");
      await t.get("/persistentSessionId");
      assertNotEqual(t.response.body, sessionId);
    });
  });

  it("does set secure cookies over https", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    t.cookieOptions({ secure: true });

    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue", { headers: { HTTPS: "on" } });

      t.assertResponse("success");
      t.assertSessionCookie("path=/; secure; HttpOnly", { foo: "bar" });
    });
  });

  // PERMANENT-SKIP: `with_autoload_path` pushes a Zeitwerk dir; CLAUDE.md, "Trails has no autoloader (`Rails.autoloaders` / Zeitwerk)".
  it.skip("deserializes unloaded classes on get id", () => {});

  // PERMANENT-SKIP: `with_autoload_path` pushes a Zeitwerk dir; CLAUDE.md, "Trails has no autoloader (`Rails.autoloaders` / Zeitwerk)".
  it.skip("deserializes unloaded classes on get value", () => {});

  it("close raises when data overflows", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    await t.withTestRouteSet(async () => {
      const error = await assertRaise([CookieOverflow], {}, async () => {
        await t.get("/raiseDataOverflow");
      });
      assertEqual("_myapp_session cookie overflowed with size 5612 bytes", error.message);
    });
  });

  it("doesnt write session cookie if session is not accessed", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/noSessionAccess");
      t.assertResponse("success");
      assertNil(t.headers!.get("Set-Cookie"));
    });
  });

  it("doesnt write session cookie if session is unchanged", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    await t.withTestRouteSet(async () => {
      t.cookies.set(
        SessionKey,
        "BAh7BjoIZm9vIghiYXI%3D--" + "fef868465920f415f2c0652d6910d3af288a0367",
      );
      await t.get("/noSessionAccess");
      t.assertResponse("success");
      assertNil(t.headers!.get("Set-Cookie"));
    });
  });

  it("setting session value after session reset", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertResponse("success");
      const sessionPayload = t.response.body;
      t.assertSessionCookie("path=/; HttpOnly", { foo: "bar" });

      await t.get("/callResetSession");
      t.assertResponse("success");
      assertNotEqual([], t.headers!.get("Set-Cookie"));
      assertNotNil(t.headers!.get("Set-Cookie"));
      assertNotNil(sessionPayload);
      assertNotEqual(sessionPayload, t.cookies.get(SessionKey));

      await t.get("/getSessionValue");
      t.assertResponse("success");
      assertEqual("foo: nil", t.response.body);
    });
  });

  it("class type after session reset", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertResponse("success");
      t.assertSessionCookie("path=/; HttpOnly", { foo: "bar" });

      await t.get("/getClassAfterResetSession");
      t.assertResponse("success");
      assertNotEqual([], t.headers!.get("Set-Cookie"));
      assertEqual("class: ActionDispatch::Request::Session", t.response.body);
    });
  });

  it("getting from nonexistent session", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/getSessionValue");
      t.assertResponse("success");
      assertEqual("foo: nil", t.response.body);
      assertNil(t.headers!.get("Set-Cookie"), "should only create session on write, not read");
    });
  });

  it("setting session value after session clear", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertResponse("success");
      t.assertSessionCookie("path=/; HttpOnly", { foo: "bar" });

      await t.get("/callSessionClear");
      t.assertResponse("success");

      await t.get("/getSessionValue");
      t.assertResponse("success");
      assertEqual("foo: nil", t.response.body);
    });
  });

  it("persistent session id", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      await t.get("/persistentSessionId");
      t.assertResponse("success");
      assertEqual(32, t.response.body.length);
      const sessionId = t.response.body;
      await t.get("/persistentSessionId");
      assertEqual(sessionId, t.response.body);
      t.resetBang();
      await t.get("/persistentSessionId");
      assertNotEqual(sessionId, t.response.body);
    });
  });

  it("setting session id to nil is respected", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      await t.get("/getSessionId");
      const sid = t.response.body;
      assertEqual(36, sid.length);

      await t.get("/changeSessionId");
      assertNotEqual(sid, t.response.body);
    });
  });

  // BLOCKED: rack-session-commit-session-expiry-reads-time-now
  it.skip("session store with expire after", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    t.cookieOptions({ expireAfter: Duration.hours(5) });

    await t.withTestRouteSet(async () => {
      let time = Time.local(2008, 4, 24);

      await stub(Time, "now", time, [], async () => {
        const expectedExpiry = time
          .plusWithDuration(Duration.hours(5))
          .utc()
          .strftime("%a, %d %b %Y %H:%M:%S GMT");

        await t.get("/setSessionValue");

        t.assertResponse("success");
        t.assertSessionCookie(`path=/; expires=${expectedExpiry}; HttpOnly`, { foo: "bar" });
      });

      time = time.plusWithDuration(Duration.hours(3));
      await stub(Time, "now", time, [], async () => {
        const expectedExpiry = time
          .plusWithDuration(Duration.hours(5))
          .utc()
          .strftime("%a, %d %b %Y %H:%M:%S GMT");

        await t.get("/noSessionAccess");

        t.assertResponse("success");
        t.assertSessionCookie(`path=/; expires=${expectedExpiry}; HttpOnly`, { foo: "bar" });
      });
    });
  });

  // BLOCKED: rack-session-commit-session-expiry-reads-time-now
  it.skip("session store with expire after does not accept expired session", async ({
    testCase,
  }) => {
    const t = testCase as CookieStoreTest;
    t.cookieOptions({ expireAfter: Duration.hours(5) });

    await t.withTestRouteSet(async () => {
      let time = Time.local(2017, 11, 12);

      await stub(Time, "now", time, [], async () => {
        const expectedExpiry = time
          .plusWithDuration(Duration.hours(5))
          .utc()
          .strftime("%a, %d %b %Y %H:%M:%S GMT");

        await t.get("/setSessionValue");
        await t.get("/getSessionValue");

        t.assertResponse("success");
        assertEqual('foo: "bar"', t.response.body);
        t.assertSessionCookie(`path=/; expires=${expectedExpiry}; HttpOnly`, { foo: "bar" });
      });

      time = time.plusWithDuration(Duration.hours(5).plus(Duration.minutes(1)));

      await stub(Time, "now", time, [], async () => {
        await t.get("/getSessionValue");

        t.assertResponse("success");
        assertEqual("foo: nil", t.response.body);
      });
    });
  });

  it("session store with explicit domain", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    t.cookieOptions({ domain: "example.es" });

    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      assertMatch(/domain=example\.es/, t.headers!.get("Set-Cookie") as string);
      t.headers!.get("Set-Cookie");
    });
  });

  it("session store without domain", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      assertNoMatch(/domain=/, t.headers!.get("Set-Cookie") as string);
    });
  });

  it("session store with nil domain", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    t.cookieOptions({ domain: null });

    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      assertNoMatch(/domain=/, t.headers!.get("Set-Cookie") as string);
    });
  });

  it("session store with all domains", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    t.cookieOptions({ domain: ":all" });

    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      assertMatch(/domain=example\.com/, t.headers!.get("Set-Cookie") as string);
    });
  });

  it("default same_site derives SameSite from env", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertSetCookieAttributes("_myapp_session", "SameSite=Lax");
    });
  });

  it("explicit same_site sets SameSite", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    t.cookieOptions({ sameSite: ":strict" });

    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertSetCookieAttributes("_myapp_session", "SameSite=Strict");
    });
  });

  it("explicit nil same_site omits SameSite", async ({ testCase }) => {
    const t = testCase as CookieStoreTest;
    t.cookieOptions({ sameSite: null });

    await t.withTestRouteSet(async () => {
      await t.get("/setSessionValue");
      t.assertNotSetCookieAttributes("_myapp_session", "SameSite");
    });
  });
});
