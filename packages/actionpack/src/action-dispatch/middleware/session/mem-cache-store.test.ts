import { describe, expect, it } from "vitest";
import { MemoryStore } from "@blazetrails/activesupport";
import { MemCacheStore } from "./mem-cache-store.js";
import { SessionId } from "@blazetrails/rack-session";

describe("ActionDispatch::Session::MemCacheStore", () => {
  it("aliases :expires to :expire_after", () => {
    const cache = new MemoryStore();
    const store = new MemCacheStore(undefined, { cache, expires: 600 });
    expect(store.options.expireAfter).toBe(600);
  });

  it("keeps :expire_after when both are given", () => {
    const cache = new MemoryStore();
    const store = new MemCacheStore(undefined, {
      cache,
      expires: 600,
      expireAfter: 900,
    });
    expect(store.options.expireAfter).toBe(900);
  });

  it("inherits CacheStore session behavior", () => {
    const cache = new MemoryStore();
    const store = new MemCacheStore(undefined, { cache });
    const [sid, session] = store.findSession({}, null);
    expect(sid).toBeInstanceOf(SessionId);
    expect(session).toEqual({});
  });

  it("requires a cache option", () => {
    expect(() => new MemCacheStore(undefined, {})).toThrow(/cache/);
  });

  it("registers mixin methods as own properties on the prototype", () => {
    const proto = MemCacheStore.prototype;
    const ownNames = [
      "initializeSid",
      "makeRequest",
      "staleSessionCheckBang",
      "prepareSession",
      "isLoadedSession",
      "generateSid",
    ];
    for (const name of ownNames) {
      expect(name in proto).toBe(true);
    }
  });

  it("keeps generateSid returning SessionId after mixin inclusion", () => {
    const cache = new MemoryStore();
    const store = new MemCacheStore(undefined, { cache });
    expect(store.generateSid()).toBeInstanceOf(SessionId);
  });
});
