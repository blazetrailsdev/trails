import { describe, expect, it } from "vitest";

import type { PersistedRequest, PersistedSession, SessionOptions } from "../index.js";
import {
  DEFAULT_OPTIONS,
  Persisted,
  PersistedSecure,
  SecureSessionHash,
  SessionHash,
  SessionId,
} from "../index.js";

function stubRequest(): PersistedRequest {
  return {
    env: {},
    cookies: {},
    params: {},
    getHeader: () => undefined as unknown as PersistedSession,
    setHeader: () => {},
    sessionOptions: {} as unknown as SessionOptions,
  };
}

function stubStore(
  id: unknown = "id",
  session: Record<string, unknown> = { foo: ":bar", baz: ":qux", x: { y: 1 } },
): Persisted {
  return {
    loadSession: () => [id, session],
    sessionExists: () => true,
  } as unknown as Persisted;
}

describe("Rack::Session::SessionId", () => {
  it("private_id is versioned and hashed", () => {
    const sid = new SessionId("a".repeat(32));
    expect(sid.privateId).toMatch(/^2::[0-9a-f]{64}$/);
  });

  it("cookie_value and to_s answer the public id", () => {
    const sid = new SessionId("abc");
    expect(sid.cookieValue).toBe("abc");
    expect(String(sid)).toBe("abc");
  });

  it("empty? is always false", () => {
    expect(new SessionId("").isEmpty()).toBe(false);
  });
});

describe("Rack::Session::Abstract::Persisted", () => {
  it("deletes key, cookie_only and same_site out of the default options", () => {
    const store = new Persisted(undefined, { key: "_sid", sameSite: "lax" });
    expect(store.key).toBe("_sid");
    expect(store.sameSite).toBe("lax");
    expect(store.defaultOptions).not.toHaveProperty("key");
    expect(store.defaultOptions).not.toHaveProperty("cookieOnly");
    expect(store.defaultOptions).not.toHaveProperty("sameSite");
    expect(store.defaultOptions.path).toBe(DEFAULT_OPTIONS.path);
  });

  it("find_session is not implemented", () => {
    expect(() => new Persisted().findSession(stubRequest(), null)).toThrow(
      "#find_session not implemented.",
    );
  });
});

describe("Rack::Session::Abstract::PersistedSecure", () => {
  it("generate_sid wraps the hex sid in a SessionId", () => {
    const sid = new PersistedSecure().generateSid();
    expect(sid).toBeInstanceOf(SessionId);
    expect(sid.publicId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("extract_session_id answers the falsy public id itself", () => {
    const store = new PersistedSecure(undefined, { cookieOnly: true });
    expect(store.extractSessionId(stubRequest())).toBeNull();
  });

  it("cookie_value reads cookie_value off the written data", () => {
    const sid = new SessionId("xyz");
    expect(new PersistedSecure().cookieValue(sid)).toBe("xyz");
  });
});

describe("Rack::Session::Abstract::SessionHash", () => {
  function sessionHash(session: Record<string, unknown> = { foo: ":bar" }): SessionHash {
    return new SessionHash(stubStore("id", session), null as unknown as PersistedRequest);
  }

  it("fetch answers a stored null rather than the default", () => {
    expect(sessionHash({ foo: null }).fetch("foo", ":default")).toBeNull();
  });

  it("inspect renders the not-yet-loaded form until the store is read", () => {
    const hash = sessionHash();
    expect(hash.inspect()).toMatch(/^#<SessionHash:0x[0-9a-f]+ not yet loaded>$/);
    hash.loadBang();
    expect(hash.inspect()).toBe('{"foo"=>:bar}');
  });

  it("id memoizes the seat, so a null extracted id is asked for once", () => {
    let calls = 0;
    const store = {
      extractSessionId: () => {
        calls += 1;
        return null;
      },
    } as unknown as Persisted;
    const hash = new SessionHash(store, null as unknown as PersistedRequest);
    expect(hash.id()).toBeNull();
    expect(hash.id()).toBeNull();
    expect(calls).toBe(1);
  });
});

describe("Rack::Session::Abstract::Persisted", () => {
  it("session_class answers SessionHash, and SecureSessionHash on PersistedSecure", () => {
    expect(new Persisted().sessionClass()).toBe(SessionHash);
    expect(new PersistedSecure().sessionClass()).toBe(SecureSessionHash);
    expect(PersistedSecure.SecureSessionHash).toBe(SecureSessionHash);
  });
});
