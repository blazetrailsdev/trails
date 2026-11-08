import { describe, it } from "vitest";
import { assert, assertEqual, assertNotEqual, assertRaise } from "@blazetrails/activesupport";
import type { RackEnv } from "@blazetrails/rack";
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

describe("AbstractStoreTest", () => {
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

  it("update raises an exception if arg not hashable", async () => {
    const e: RackEnv = {};
    const as = new MemoryStore(app());
    await as.call(e);
    const session = Session.find(new Request(e))!;

    await assertRaise([TypeError], {}, () => {
      session.update("Not hashable");
    });
  });
});
