import { describe, expect, it } from "vitest";
import { MemoryStore } from "@blazetrails/activesupport";
import { CacheStore } from "./cache-store.js";
import { SessionId } from "./abstract-store.js";

function makeStore(opts: { expireAfter?: number } = {}): {
  store: CacheStore;
  cache: MemoryStore;
} {
  const cache = new MemoryStore();
  const store = new CacheStore(() => undefined, { cache, ...opts });
  return { store, cache };
}

describe("ActionDispatch::Session::CacheStore", () => {
  it("requires a cache option", () => {
    expect(() => new CacheStore(() => undefined, {})).toThrow(/cache/);
  });

  describe("findSession", () => {
    it("returns a new sid and empty hash when sid is null", () => {
      const { store } = makeStore();
      const [sid, session] = store.findSession({}, null);
      expect(sid).toBeInstanceOf(SessionId);
      expect(sid.publicId).toMatch(/^[0-9a-f]{32}$/);
      expect(sid.privateId).toMatch(/^[0-9a-f]{64}$/);
      expect(session).toEqual({});
    });

    it("returns the stored session when found by privateId", () => {
      const { store, cache } = makeStore();
      const sid = new SessionId("a".repeat(32));
      cache.write(`_session_id:${sid.privateId}`, { user: 1 });
      const [returned, session] = store.findSession({}, sid);
      expect(returned).toBe(sid);
      expect(session).toEqual({ user: 1 });
    });

    it("falls back to publicId lookup", () => {
      const { store, cache } = makeStore();
      const sid = new SessionId("b".repeat(32));
      cache.write(`_session_id:${sid.publicId}`, { user: 2 });
      const [, session] = store.findSession({}, sid);
      expect(session).toEqual({ user: 2 });
    });

    it("returns new sid when stored session is missing", () => {
      const { store } = makeStore();
      const sid = new SessionId("c".repeat(32));
      const [returned, session] = store.findSession({}, sid);
      expect(returned).not.toBe(sid);
      expect(session).toEqual({});
    });
  });

  describe("writeSession", () => {
    it("writes session under the privateId key", () => {
      const { store, cache } = makeStore();
      const sid = new SessionId("d".repeat(32));
      store.writeSession({}, sid, { user: 3 }, { expireAfter: 60 });
      expect(cache.read(`_session_id:${sid.privateId}`)).toEqual({ user: 3 });
    });

    it("deletes the cache entry when session is null", () => {
      const { store, cache } = makeStore();
      const sid = new SessionId("e".repeat(32));
      cache.write(`_session_id:${sid.privateId}`, { user: 4 });
      store.writeSession({}, sid, null, {});
      expect(cache.read(`_session_id:${sid.privateId}`)).toBeNull();
    });
  });

  describe("deleteSession", () => {
    it("removes both privateId and publicId entries and returns a fresh sid", () => {
      const { store, cache } = makeStore();
      const sid = new SessionId("f".repeat(32));
      cache.write(`_session_id:${sid.privateId}`, { user: 5 });
      cache.write(`_session_id:${sid.publicId}`, { user: 5 });
      const fresh = store.deleteSession({}, sid, {});
      expect(cache.read(`_session_id:${sid.privateId}`)).toBeNull();
      expect(cache.read(`_session_id:${sid.publicId}`)).toBeNull();
      expect(fresh.publicId).not.toBe(sid.publicId);
    });
  });
});
