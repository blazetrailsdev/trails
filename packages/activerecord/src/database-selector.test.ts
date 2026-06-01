import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "./base.js";
import { currentPreventingWrites } from "./core.js";
import { DatabaseSelector } from "./middleware/database-selector.js";
import { Resolver, type ResolverContext } from "./middleware/database-selector/resolver.js";
import { Session, type SessionStore } from "./middleware/database-selector/resolver/session.js";
import { Temporal } from "@blazetrails/activesupport/temporal";

function makeStore(data: Record<string, unknown> = {}): SessionStore {
  return {
    get: (k) => data[k],
    set: (k, v) => {
      data[k] = v;
    },
    delete: (k) => {
      delete data[k];
    },
  };
}

function isWriting() {
  return Base.connectedToQ({ role: "writing" });
}
function isReading() {
  return Base.connectedToQ({ role: "reading" });
}
function isPreventingWrites() {
  return currentPreventingWrites.call(Base as any);
}
function fiveSecondsAgo() {
  return Session.convertTimeToTimestamp(Temporal.Now.instant().subtract({ milliseconds: 5000 }));
}

describe("DatabaseSelectorTest", () => {
  let data: Record<string, unknown>;
  let session: Session;

  beforeEach(() => {
    data = {};
    session = new Session(makeStore(data));
  });

  it("empty session", () => {
    expect(session.lastWriteTimestamp().epochMilliseconds).toBe(0);
  });

  it("writing the session timestamps", () => {
    session.updateLastWriteTimestamp();
    const session2 = new Session(makeStore(data));
    expect(session.lastWriteTimestamp().epochMilliseconds).toBe(
      session2.lastWriteTimestamp().epochMilliseconds,
    );
  });

  it("writing session time changes", async () => {
    session.updateLastWriteTimestamp();
    const before = session.lastWriteTimestamp();
    await new Promise((r) => setTimeout(r, 100));
    session.updateLastWriteTimestamp();
    expect(session.lastWriteTimestamp().epochMilliseconds).not.toBe(before.epochMilliseconds);
  });

  it("read from replicas", async () => {
    data["lastWrite"] = fiveSecondsAgo();
    const resolver = new Resolver(session);
    let called = false;
    await resolver.read(async () => {
      called = true;
      expect(isReading()).toBe(true);
    });
    expect(called).toBe(true);
  });

  it("can write while reading from replicas if explicit", async () => {
    data["lastWrite"] = fiveSecondsAgo();
    const resolver = new Resolver(session);
    let called = false;
    await resolver.read(async () => {
      called = true;
      expect(isReading()).toBe(true);
      expect(isPreventingWrites()).toBe(true);
      await Base.connectedTo({ role: "writing", preventWrites: false }, async () => {
        expect(isWriting()).toBe(true);
        expect(isPreventingWrites()).toBe(false);
      });
      expect(isReading()).toBe(true);
      expect(isPreventingWrites()).toBe(true);
    });
    expect(called).toBe(true);
  });

  it("read from primary", async () => {
    data["lastWrite"] = Session.convertTimeToTimestamp(Temporal.Now.instant());
    const resolver = new Resolver(session);
    let called = false;
    await resolver.read(async () => {
      called = true;
      expect(isWriting()).toBe(true);
    });
    expect(called).toBe(true);
  });

  it("write to primary", async () => {
    const resolver = new Resolver(session);
    expect(data["lastWrite"]).toBeUndefined();
    let called = false;
    await resolver.write(async () => {
      expect(isWriting()).toBe(true);
      called = true;
    });
    expect(called).toBe(true);
    expect(data["lastWrite"]).toBeTruthy();
  });

  it("write to primary and update custom context", async () => {
    class CustomContext extends Session {
      private wrote = false;
      override updateLastWriteTimestamp(): void {
        super.updateLastWriteTimestamp();
        this.wrote = true;
      }
      override save(r: Record<string, unknown>): void {
        r["wroteToPrimary"] = this.wrote;
      }
    }
    const resolver = new Resolver(new CustomContext(makeStore(data)));
    expect(data["lastWrite"]).toBeUndefined();
    let called = false;
    await resolver.write(async () => {
      expect(isWriting()).toBe(true);
      called = true;
    });
    expect(called).toBe(true);
    const response: Record<string, unknown> = {};
    resolver.updateContext(response);
    expect(data["lastWrite"]).toBeTruthy();
    expect(response["wroteToPrimary"]).toBe(true);
  });

  it("write to primary with exception", async () => {
    const resolver = new Resolver(session);
    expect(data["lastWrite"]).toBeUndefined();
    let called = false;
    await expect(
      resolver.write(async () => {
        expect(isWriting()).toBe(true);
        called = true;
        throw new Error("RecordNotFound");
      }),
    ).rejects.toThrow("RecordNotFound");
    expect(called).toBe(true);
    expect(data["lastWrite"]).toBeTruthy();
  });

  it("read from primary with options", async () => {
    const resolver = new Resolver(session, { delay: 5000 });
    expect(data["lastWrite"]).toBeUndefined();
    let called = false;
    await resolver.write(async () => {
      expect(isWriting()).toBe(true);
      called = true;
    });
    expect(called).toBe(true);
    expect(data["lastWrite"]).toBeTruthy();
    let read = false;
    await resolver.read(async () => {
      expect(isWriting()).toBe(true);
      read = true;
    });
    expect(read).toBe(true);
  });

  it("preventing writes turns off for primary write", async () => {
    const resolver = new Resolver(session, { delay: 5000 });
    expect(data["lastWrite"]).toBeUndefined();
    let called = false;
    await resolver.write(async () => {
      expect(isWriting()).toBe(true);
      called = true;
    });
    expect(called).toBe(true);
    expect(data["lastWrite"]).toBeTruthy();
    let read = false;
    let write = false;
    await resolver.read(async () => {
      expect(isWriting()).toBe(true);
      expect(isPreventingWrites()).toBe(true);
      read = true;
      await resolver.write(async () => {
        expect(isWriting()).toBe(true);
        expect(isPreventingWrites()).toBe(false);
        write = true;
      });
    });
    expect(write).toBe(true);
    expect(read).toBe(true);
  });

  it.skip("preventing writes works in a threaded environment", async () => {
    // BLOCKED: connection-pool — async-isolation — connectedToStack is a mutable array shallow-copied by
    // IsolatedExecutionState.scope, so concurrent async tasks bleed preventWrites across
    // each other. Ruby uses thread-local storage; JS needs per-scope array instances.
  });

  it("read from replica with no delay", async () => {
    const resolver = new Resolver(session, { delay: 0 });
    expect(data["lastWrite"]).toBeUndefined();
    let called = false;
    await resolver.write(async () => {
      expect(isWriting()).toBe(true);
      called = true;
    });
    expect(called).toBe(true);
    expect(data["lastWrite"]).toBeTruthy();
    let read = false;
    await resolver.read(async () => {
      expect(isReading()).toBe(true);
      read = true;
    });
    expect(read).toBe(true);
  });

  it("the middleware chooses writing role with POST request", async () => {
    const mw = new DatabaseSelector(async () => {
      expect(isWriting()).toBe(true);
      return {};
    });
    await mw.call({ method: "POST", session: makeStore() });
  });

  it("the middleware chooses reading role with GET request", async () => {
    const mw = new DatabaseSelector(async () => {
      expect(isReading()).toBe(true);
      return {};
    });
    await mw.call({ method: "GET", session: makeStore() });
  });

  it("the middleware chooses reading role with POST request if resolver tells it to", async () => {
    class ReadonlyResolver extends Resolver {
      static override call(ctx: ResolverContext, opts: Record<string, unknown>): ReadonlyResolver {
        return new ReadonlyResolver(ctx, opts as { delay?: number });
      }
      override isReadingRequest(_r: { method: string }): boolean {
        return true;
      }
    }
    const mw = new DatabaseSelector(async () => {
      expect(isReading()).toBe(true);
      return {};
    }, ReadonlyResolver);
    await mw.call({ method: "POST", session: makeStore() });
  });
});
