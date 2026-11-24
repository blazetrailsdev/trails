import { describe, it } from "vitest";
import {
  assert,
  assertEqual,
  assertNotEqual,
  assertRaise,
} from "@blazetrails/activesupport/testing/assertions";
import { include } from "@blazetrails/ruby-compat/include";
import type { Included } from "@blazetrails/ruby-compat/include";
import { MockRequest, MockResponse, type RackEnv } from "@blazetrails/rack";
import { Cookies } from "../../../../lib/action-dispatch/middleware/cookies.js";
import { CookieAssertions } from "../../../support/abstract-unit.js";
import { AbstractStore } from "../../../../lib/action-dispatch/middleware/session/abstract-store.js";
import { Request } from "../../../../lib/action-dispatch/http/request.js";
import { Session } from "../../../../lib/action-dispatch/request/session.js";

class MemoryStore extends AbstractStore {
  declare _sessions: Record<string, Record<string, unknown>>;

  constructor(app: (env: RackEnv) => unknown) {
    super(app as never);
    this._sessions = {};
  }

  findSession(_env: unknown, sid: unknown): [unknown, Record<string, unknown>] {
    sid ??= 1;
    const session = (this._sessions[String(sid)] ??= {});
    return [sid, session];
  }

  override async writeSession(
    _env: unknown,
    sid: unknown,
    session: Record<string, unknown>,
    _options: unknown,
  ): Promise<unknown> {
    return (this._sessions[String(sid)] = session);
  }

  override sessionExists(_req: unknown): boolean {
    return true;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class AbstractStoreTest {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface AbstractStoreTest extends Included<typeof CookieAssertions> {}
include(AbstractStoreTest, CookieAssertions);

describe("AbstractStoreTest", () => {
  const t = new AbstractStoreTest();
  let env: RackEnv | null = null;
  function app() {
    env = null;
    return (e: RackEnv) => {
      env = e;
      return [200, {}, []];
    };
  }

  it("session is set", async () => {
    const e: RackEnv = {};
    const as = new MemoryStore(app());
    await as.call(e);

    assert(env);
    assert(Session.find(new Request(env!)));
  });

  it("session cookie gets same site from env", async () => {
    const writeSession = async (env: RackEnv) => {
      await new Request(env).session.set("foo", "bar");
      return [200, {}, []];
    };
    const stack = new Cookies(new MemoryStore(writeSession));
    const env = MockRequest.envFor("/", {
      "action_dispatch.cookies_same_site_protection": () => ":strict",
    });

    const response = new MockResponse(...((await stack.call(env)) as [number, never, never]));

    t.assertSetCookieAttributes(
      "_session_id",
      "SameSite=Strict",
      response.headers["set-cookie"] as string,
    );
  });

  it("new session object is merged with old", async () => {
    const e: RackEnv = {};
    const as = new MemoryStore(app());
    await as.call(e);

    assert(env);
    const session = Session.find(new Request(env!))!;
    await session.set("foo", "bar");

    await as.call(env!);
    const session1 = Session.find(new Request(env!))!;

    assertNotEqual(session, session1);
    assertEqual(await session.toHash(), await session1.toHash());
  });

  it("update raises an exception if arg not hashable", async () => {
    const e: RackEnv = {};
    const as = new MemoryStore(app());
    await as.call(e);
    const session = Session.find(new Request(e))!;

    await assertRaise([TypeError], {}, async () => {
      await session.update("Not hashable");
    });
  });
});
