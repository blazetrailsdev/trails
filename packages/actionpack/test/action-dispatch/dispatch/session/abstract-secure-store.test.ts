import { describe, it } from "vitest";
import { assert, assertEqual, assertNotEqual } from "@blazetrails/activesupport/testing/assertions";
import type { RackEnv } from "@blazetrails/rack";
import { SessionId as RackSessionId } from "@blazetrails/rack-session";
import { AbstractSecureStore } from "../../../../lib/action-dispatch/middleware/session/abstract-store.js";
import { Request } from "../../../../lib/action-dispatch/http/request.js";
import { Session } from "../../../../lib/action-dispatch/request/session.js";

class SessionId extends RackSessionId {
  declare _cookieValue: unknown;

  constructor(sessionId: string, cookieValue: unknown) {
    super(sessionId);
    this._cookieValue = cookieValue;
  }

  override get cookieValue(): string {
    return this._cookieValue as string;
  }
}

class MemoryStore extends AbstractSecureStore {
  declare _sessions: Record<string, unknown>;

  constructor(app: (env: RackEnv) => unknown) {
    super(app as never);
    this._sessions = {};
  }

  findSession(_env: unknown, sid: unknown): [unknown, Record<string, unknown>] {
    sid ??= 1;
    const session = (this._sessions[String(sid)] ??= {}) as Record<string, unknown>;
    return [sid, session];
  }

  override async writeSession(
    _env: unknown,
    sid: unknown,
    session: Record<string, unknown>,
    _options: unknown,
  ): Promise<unknown> {
    return (this._sessions[String(sid)] = new SessionId(sid as string, session));
  }

  override sessionExists(_req: unknown): boolean {
    return true;
  }
}

describe("AbstractSecureStoreTest", () => {
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

  it("new session object is merged with old", async () => {
    const e: RackEnv = {};
    const as = new MemoryStore(app());
    await as.call(e);

    assert(env);
    const session = Session.find(new Request(env!))!;
    session.set("foo", "bar");

    await as.call(env!);
    const session1 = Session.find(new Request(env!))!;

    assertNotEqual(session, session1);
    assertEqual(session.toHash(), session1.toHash());
  });
});
