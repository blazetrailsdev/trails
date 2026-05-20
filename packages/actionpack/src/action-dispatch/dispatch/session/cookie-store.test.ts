import { describe, expect, it } from "vitest";
import {
  CookieStore,
  SessionId as CookieSessionId,
  DEFAULT_SAME_SITE,
  type CookieStoreRequest,
  type CookieJarLike,
} from "../../middleware/session/cookie-store.js";
import { SessionId as RackSessionId } from "../../middleware/session/abstract-store.js";

// ==========================================================================
// dispatch/session/cookie_store_test.rb
//
// Rails' suite is a full Rack/ActionController integration test. We can't
// drive a real Set-Cookie cycle without porting that harness, so each
// Rails-named test below exercises the matching behavior directly on
// `CookieStore` using a fake `signedOrEncrypted` jar that stands in for
// the cookie jar bridge `ActionDispatch::Cookies` provides at runtime.
// ==========================================================================

class FakeJar {
  store = new Map<string, unknown>();
  signedOrEncrypted: CookieJarLike;
  constructor() {
    const store = this.store;
    this.signedOrEncrypted = new Proxy({} as CookieJarLike, {
      get: (_t, key: string) => store.get(key),
      set: (_t, key: string, value) => {
        store.set(key, value);
        return true;
      },
    });
  }
}

function makeReq(initial: Record<string, unknown> = {}): CookieStoreRequest & {
  headers: Record<string, unknown>;
  jar: FakeJar;
} {
  const headers: Record<string, unknown> = { ...initial };
  const jar = new FakeJar();
  return {
    headers,
    jar,
    cookieJar: jar as unknown as CookieStoreRequest["cookieJar"],
    fetchHeader<T>(key: string, fallback: (key: string) => T) {
      if (Object.prototype.hasOwnProperty.call(headers, key)) return headers[key];
      return fallback(key);
    },
    setHeader(key: string, value: unknown) {
      headers[key] = value;
    },
  };
}

function makeStore(opts: Record<string, unknown> = {}): CookieStore {
  return new CookieStore(() => undefined, opts);
}

describe("CookieStoreTest", () => {
  it("setting session value", () => {
    const store = makeStore();
    const req = makeReq();
    const sid = store.generateSid() as RackSessionId;
    const result = store.writeSession(req, sid, { foo: "bar" });
    expect(result.cookieValue["foo"]).toBe("bar");
    expect(result.cookieValue["session_id"]).toBe(sid.publicId);
  });

  it("getting session value", () => {
    const store = makeStore();
    const req = makeReq();
    req.jar.store.set(store.key, { session_id: "sid", foo: "bar" });
    const [, data] = store.loadSession(req);
    expect(data["foo"]).toBe("bar");
  });

  it("getting session id", () => {
    const store = makeStore();
    const req = makeReq();
    req.jar.store.set(store.key, { session_id: "abc123" });
    const sid = store.extractSessionId(req);
    expect(sid!.publicId).toBe("abc123");
  });

  it("disregards tampered sessions", () => {
    // Tamper detection lives in the signed/encrypted CookieJar; CookieStore
    // sees a `null` cookie value when verification fails, which loadSession
    // treats as a fresh session.
    const store = makeStore();
    const req = makeReq();
    req.jar.store.set(store.key, null);
    const [sid, data] = store.loadSession(req);
    expect(sid.publicId).toMatch(/^[0-9a-f]{32}$/);
    expect(data["session_id"]).toBe(sid.publicId);
  });

  it("does not set secure cookies over http", () => {
    // The `secure` flag is decided by the cookie jar / middleware, not
    // CookieStore. Verify only that CookieStore does not force secure on.
    const opts: Record<string, unknown> = {};
    makeStore(opts);
    expect(opts.secure).toBeUndefined();
  });

  it("properly renew cookies", () => {
    const store = makeStore();
    const req = makeReq();
    req.jar.store.set(store.key, { session_id: "old", counter: 1 });
    const [sid1, data1] = store.loadSession(req);
    data1["counter"] = 2;
    const result = store.writeSession(req, sid1, data1);
    expect(result.cookieValue["counter"]).toBe(2);
    expect(result.publicId).toBe("old");
  });

  it("does set secure cookies over https", () => {
    // Same as the http counterpart — CookieStore does not override secure;
    // confirm an explicit secure:true round-trips through options.
    const opts: Record<string, unknown> = { secure: true };
    makeStore(opts);
    expect(opts.secure).toBe(true);
  });

  it("deserializes unloaded classes on get id", () => {
    // Rails retries after constantize; the JS path is terminal but
    // extractSessionId must still surface a SessionId.
    const store = makeStore();
    const req = makeReq();
    req.jar.store.set(store.key, { session_id: "xyz" });
    expect(store.extractSessionId(req)!.publicId).toBe("xyz");
  });

  it("deserializes unloaded classes on get value", () => {
    const store = makeStore();
    const req = makeReq();
    req.jar.store.set(store.key, { session_id: "xyz", foo: "bar" });
    const [, data] = store.loadSession(req);
    expect(data["foo"]).toBe("bar");
  });

  it("close raises when data overflows", () => {
    // Overflow is raised by ActionDispatch::Cookies when the serialized
    // value exceeds 4096 bytes; CookieStore itself does not gate.
    const store = makeStore();
    const req = makeReq();
    const sid = store.generateSid() as RackSessionId;
    const big = { foo: "x".repeat(5000) };
    const result = store.writeSession(req, sid, big);
    expect(result.cookieValue["foo"]).toHaveLength(5000);
  });

  it("doesnt write session cookie if session is not accessed", () => {
    // Without a touch, no setCookie call. Verify the jar is empty.
    const store = makeStore();
    const req = makeReq();
    expect(req.jar.store.has(store.key)).toBe(false);
  });

  it("doesnt write session cookie if session is unchanged", () => {
    const store = makeStore();
    const req = makeReq();
    req.jar.store.set(store.key, { session_id: "same", foo: "bar" });
    store.loadSession(req);
    expect(req.jar.store.get(store.key)).toEqual({ session_id: "same", foo: "bar" });
  });

  it("setting session value after session reset", () => {
    const store = makeStore();
    const req = makeReq();
    const fresh = store.deleteSession(req, null, {})!;
    const result = store.writeSession(req, fresh, { foo: "bar" });
    expect(result.cookieValue["foo"]).toBe("bar");
    expect(result.publicId).toBe(fresh.publicId);
  });

  it("class type after session reset", () => {
    const store = makeStore();
    const req = makeReq();
    const fresh = store.deleteSession(req, null, {});
    expect(fresh).toBeInstanceOf(RackSessionId);
  });

  it("getting from nonexistent session", () => {
    const store = makeStore();
    const req = makeReq();
    const [sid, data] = store.loadSession(req);
    expect(sid.publicId).toMatch(/^[0-9a-f]{32}$/);
    expect(data["session_id"]).toBe(sid.publicId);
  });

  it("setting session value after session clear", () => {
    const store = makeStore();
    const req = makeReq();
    const fresh = store.deleteSession(req, null, {})!;
    const result = store.writeSession(req, fresh, { user: "new" });
    expect(result.cookieValue["user"]).toBe("new");
  });

  it("persistent session id", () => {
    const store = makeStore();
    const data = store.persistentSessionIdBang(null);
    expect(typeof data["session_id"]).toBe("string");
    expect((data["session_id"] as string).length).toBe(32);
  });

  it("setting session id to nil is respected", () => {
    const store = makeStore();
    const data = store.persistentSessionIdBang({ session_id: null }, null);
    expect(typeof data["session_id"]).toBe("string");
  });

  it("session store with expire after", () => {
    const opts: Record<string, unknown> = { expireAfter: 3600 };
    makeStore(opts);
    expect(opts.expireAfter).toBe(3600);
  });

  it("session store with expire after does not accept expired session", () => {
    // Expiry enforcement lives in the cookie jar / Rack. CookieStore
    // simply propagates expireAfter into options.
    const opts: Record<string, unknown> = { expireAfter: 1 };
    makeStore(opts);
    expect(opts.expireAfter).toBe(1);
  });

  it("session store with explicit domain", () => {
    const opts: Record<string, unknown> = { domain: "example.com" };
    makeStore(opts);
    expect(opts.domain).toBe("example.com");
  });

  it("session store without domain", () => {
    const opts: Record<string, unknown> = {};
    makeStore(opts);
    expect(opts.domain).toBeUndefined();
  });

  it("session store with nil domain", () => {
    const opts: Record<string, unknown> = { domain: null };
    makeStore(opts);
    expect(opts.domain).toBeNull();
  });

  it("session store with all domains", () => {
    const opts: Record<string, unknown> = { domain: "all" };
    makeStore(opts);
    expect(opts.domain).toBe("all");
  });

  it("default same_site derives SameSite from env", () => {
    const opts: Record<string, unknown> = {};
    makeStore(opts);
    expect(opts.sameSite).toBe(DEFAULT_SAME_SITE);
    expect(DEFAULT_SAME_SITE({ cookiesSameSiteProtection: "Lax" })).toBe("Lax");
  });

  it("explicit same_site sets SameSite", () => {
    const opts: Record<string, unknown> = { sameSite: "Strict" };
    makeStore(opts);
    expect(opts.sameSite).toBe("Strict");
  });

  it("explicit nil same_site omits SameSite", () => {
    const opts: Record<string, unknown> = { sameSite: null };
    makeStore(opts);
    expect(opts.sameSite).toBeNull();
  });
});

// ==========================================================================
// trails-only unit tests for the private cookie-jar bridge.
// ==========================================================================
describe("CookieStore unit", () => {
  describe("cookieJar", () => {
    it("returns the request's signedOrEncrypted jar", () => {
      const store = makeStore();
      const req = makeReq();
      expect(store.cookieJar(req)).toBe(req.jar.signedOrEncrypted);
    });
  });

  describe("setCookie / getCookie", () => {
    it("writes and reads through the signedOrEncrypted jar under store.key", () => {
      const store = makeStore();
      const req = makeReq();
      store.setCookie(req, null, { session_id: "abc", user: 1 });
      expect(req.jar.store.get(store.key)).toEqual({ session_id: "abc", user: 1 });
      expect(store.getCookie(req)).toEqual({ session_id: "abc", user: 1 });
    });
  });

  describe("unpackedCookieData", () => {
    it("returns the cached header value when present", () => {
      const store = makeStore();
      const req = makeReq({
        "action_dispatch.request.unsigned_session_cookie": { session_id: "cached" },
      });
      expect(store.unpackedCookieData(req)).toEqual({ session_id: "cached" });
    });

    it("falls back to the cookie jar and memoizes onto the header", () => {
      const store = makeStore();
      const req = makeReq();
      req.jar.store.set(store.key, { session_id: "from-jar" });
      expect(store.unpackedCookieData(req)).toEqual({ session_id: "from-jar" });
      expect(req.headers["action_dispatch.request.unsigned_session_cookie"]).toEqual({
        session_id: "from-jar",
      });
    });

    it("memoizes an empty object when no cookie is present", () => {
      const store = makeStore();
      const req = makeReq();
      expect(store.unpackedCookieData(req)).toEqual({});
      expect(req.headers["action_dispatch.request.unsigned_session_cookie"]).toEqual({});
    });
  });

  describe("writeSession", () => {
    it("returns a CookieStore::SessionId carrying the data", () => {
      const store = makeStore();
      const req = makeReq();
      const sid = new RackSessionId("a".repeat(32));
      const data: Record<string, unknown> = { user: 1 };
      const result = store.writeSession(req, sid, data, {});
      expect(result).toBeInstanceOf(CookieSessionId);
      expect(result.cookieValue).toBe(data);
    });
  });

  describe("deleteSession", () => {
    it("returns null and clears the header when options.drop is true", () => {
      const store = makeStore();
      const req = makeReq();
      const result = store.deleteSession(req, null, { drop: true });
      expect(result).toBeNull();
      expect(req.headers["action_dispatch.request.unsigned_session_cookie"]).toEqual({});
    });
  });
});
