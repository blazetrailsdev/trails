import { describe, expect, it } from "vitest";

import type { PersistedRequest, PersistedSession } from "../index.js";
import { DEFAULT_OPTIONS, Persisted, PersistedSecure, SessionId } from "../index.js";

function stubRequest(): PersistedRequest {
  return {
    env: {},
    cookies: {},
    params: {},
    getHeader: () => undefined as unknown as PersistedSession,
    setHeader: () => {},
  };
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
