import { describe, expect, it } from "vitest";

import type { PersistedRequest, PersistedSession, SessionOptions } from "./index.js";
import { Pool, SessionId } from "./index.js";

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

function stubOptions(hash: Record<string, unknown>): SessionOptions {
  return {
    get: (key: string) => hash[key],
    valuesAt: (...keys: string[]) => keys.map((key) => hash[key]),
    toHash: () => ({ ...hash }),
  };
}

describe("Rack::Session::Pool", () => {
  it("DEFAULT_OPTIONS adds drop and allow_fallback", () => {
    expect(Pool.DEFAULT_OPTIONS["drop"]).toBe(false);
    expect(Pool.DEFAULT_OPTIONS["allowFallback"]).toBe(true);
  });

  it("initialize takes allow_fallback out of the default options", () => {
    const pool = new Pool();
    expect(pool.defaultOptions).not.toHaveProperty("allowFallback");
    expect(pool.pool).toEqual({});
  });

  it("find_session stores a fresh session under a generated private id", () => {
    const pool = new Pool();
    const [sid, session] = pool.findSession(stubRequest(), null);
    expect(sid).toBeInstanceOf(SessionId);
    expect(session).toEqual({});
    expect(pool.pool[sid.privateId]).toBe(session);
  });

  it("find_session falls back to the public id when allow_fallback is set", () => {
    const pool = new Pool();
    const sid = new SessionId("abcd");
    pool.pool[sid.publicId] = { counter: 1 };
    expect(pool.findSession(stubRequest(), sid)[1]).toEqual({ counter: 1 });
  });

  it("find_session does not fall back when allow_fallback is false", () => {
    const pool = new Pool(undefined, { allowFallback: false });
    const sid = new SessionId("abcd");
    pool.pool[sid.publicId] = { counter: 1 };
    expect(pool.findSession(stubRequest(), sid)[1]).toEqual({});
  });

  it("write_session stores the session and answers the session id", () => {
    const pool = new Pool();
    const sid = new SessionId("abcd");
    expect(pool.writeSession(stubRequest(), sid, { counter: 2 }, stubOptions({}))).toBe(sid);
    expect(pool.pool[sid.privateId]).toEqual({ counter: 2 });
  });

  it("delete_session drops both ids and answers a new sid unless :drop", () => {
    const pool = new Pool();
    const sid = new SessionId("abcd");
    pool.pool[sid.privateId] = { counter: 1 };
    pool.pool[sid.publicId] = { counter: 1 };
    const newSid = pool.deleteSession(stubRequest(), sid, stubOptions({}));
    expect(newSid).toBeInstanceOf(SessionId);
    expect(pool.pool).toEqual({});
  });

  it("delete_session answers nothing when :drop is set", () => {
    const pool = new Pool();
    const sid = new SessionId("abcd");
    pool.pool[sid.privateId] = { counter: 1 };
    expect(pool.deleteSession(stubRequest(), sid, stubOptions({ drop: true }))).toBeUndefined();
    expect(pool.pool).toEqual({});
  });

  it("generate_sid retries until the private id is free", () => {
    const pool = new Pool();
    const first = pool.generateSid();
    pool.pool[first.privateId] = {};
    expect(pool.generateSid().privateId).not.toBe(first.privateId);
  });
});
