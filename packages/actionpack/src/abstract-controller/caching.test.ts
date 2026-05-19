import { describe, it, expect } from "vitest";
import { MemoryStore } from "@blazetrails/activesupport";

import {
  applyCaching,
  cache,
  cacheConfigured,
  cacheStore,
  CACHING_DEFAULTS,
  CACHING_SLOTS,
  readFragment,
  setCacheStore,
  viewCacheDependencies,
  viewCacheDependency,
  writeFragment,
  type CachingHost,
} from "./caching.js";

class HostClass {
  static cacheStore: MemoryStore | null = null;
  static performCaching = true;
  static defaultStaticExtension = ".html";
  static enableFragmentCacheLogging = false;
  static _viewCacheDependencies?: Array<(this: CachingHost) => unknown>;

  greeting = "hello";
}

function makeHost(store?: MemoryStore | null): HostClass & CachingHost {
  HostClass.cacheStore = store ?? null;
  HostClass.performCaching = true;
  HostClass._viewCacheDependencies = undefined;
  return new HostClass() as unknown as HostClass & CachingHost;
}

describe("AbstractController::Caching", () => {
  describe("defaults", () => {
    it("ships the Rails-shaped slot list and values", () => {
      expect(CACHING_SLOTS).toEqual([
        "defaultStaticExtension",
        "performCaching",
        "enableFragmentCacheLogging",
      ]);
      expect(CACHING_DEFAULTS).toEqual({
        defaultStaticExtension: ".html",
        performCaching: true,
        enableFragmentCacheLogging: false,
      });
    });

    it("applyCaching is a slot-contract no-op", () => {
      expect(() => applyCaching(HostClass)).not.toThrow();
    });
  });

  describe("cacheStore reader/writer", () => {
    it("reads the class-level slot", () => {
      const store = new MemoryStore();
      const host = makeHost(store);
      expect(cacheStore.call(host)).toBe(store);
    });
    it("returns null when no store is wired up", () => {
      expect(cacheStore.call(makeHost())).toBeNull();
    });
    it("setCacheStore assigns onto the class slot", () => {
      const host = makeHost();
      const store = new MemoryStore();
      setCacheStore.call(host, store);
      expect(HostClass.cacheStore).toBe(store);
      expect(cacheStore.call(host)).toBe(store);
    });
  });

  describe("cacheConfigured", () => {
    it("is false when no store is wired up", () => {
      expect(cacheConfigured(makeHost())).toBe(false);
    });
    it("is false when performCaching is off, even with a store", () => {
      const host = makeHost(new MemoryStore());
      HostClass.performCaching = false;
      expect(cacheConfigured(host)).toBe(false);
    });
    it("is true when both are set", () => {
      expect(cacheConfigured(makeHost(new MemoryStore()))).toBe(true);
    });
  });

  describe("viewCacheDependency / viewCacheDependencies", () => {
    it("evaluates dependency blocks in host context and drops nullish", () => {
      const host = makeHost();
      viewCacheDependency(HostClass, function (this: CachingHost) {
        return (this as unknown as HostClass).greeting;
      });
      viewCacheDependency(HostClass, () => null);
      viewCacheDependency(HostClass, () => "v2");
      expect(viewCacheDependencies.call(host)).toEqual(["hello", "v2"]);
    });
    it("returns [] when none registered", () => {
      expect(viewCacheDependencies.call(makeHost())).toEqual([]);
    });
  });

  describe("cache()", () => {
    it("yields the block when not configured", () => {
      const host = makeHost();
      let calls = 0;
      const result = cache.call(host, "k", () => {
        calls++;
        return "computed";
      });
      expect(result).toBe("computed");
      expect(calls).toBe(1);
    });
    it("fetches through the store under the controller namespace", () => {
      const store = new MemoryStore();
      const host = makeHost(store);
      let calls = 0;
      const first = cache.call(host, "page-1", () => {
        calls++;
        return "rendered";
      });
      const second = cache.call(host, "page-1", () => {
        calls++;
        return "different";
      });
      expect(first).toBe("rendered");
      expect(second).toBe("rendered");
      expect(calls).toBe(1);
      expect(store.read("controller/page-1")).toBe("rendered");
    });
    it("flattens array keys", () => {
      const store = new MemoryStore();
      const host = makeHost(store);
      cache.call(host, ["posts", 5, "edit"], () => "x");
      expect(store.read("controller/posts/5/edit")).toBe("x");
    });
  });

  describe("fragment wrappers (Caching::Fragments republish)", () => {
    it("writeFragment/readFragment round-trip via ./caching", () => {
      const store = new MemoryStore();
      const host = makeHost(store);
      writeFragment.call(host, "post/1", "rendered body");
      expect(readFragment.call(host, "post/1")).toBe("rendered body");
    });
  });
});
