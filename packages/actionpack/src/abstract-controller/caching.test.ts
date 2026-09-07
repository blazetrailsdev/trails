import { describe, it, expect } from "vitest";
import { Configurable, extend, include, MemoryStore } from "@blazetrails/activesupport";

import {
  cache,
  cacheConfigured,
  ConfigMethods,
  viewCacheDependencies,
  viewCacheDependency,
  type CachingHost,
} from "./caching.js";
import { readFragment, writeFragment } from "./caching/fragments.js";

class HostClass {
  static config = Configurable.ClassMethods.config;
  static configAccessor = Configurable.ClassMethods.configAccessor;
  config = Configurable.config;

  static _viewCacheDependencies?: Array<(this: CachingHost) => unknown>;

  greeting = "hello";
}

include(HostClass, ConfigMethods);
extend(HostClass, ConfigMethods);
HostClass.configAccessor("defaultStaticExtension");
HostClass.configAccessor("performCaching");
HostClass.configAccessor("enableFragmentCacheLogging");

const HostConfig = HostClass as unknown as typeof HostClass & {
  cacheStore: unknown;
  performCaching: boolean;
  defaultStaticExtension: string;
};

function makeHost(store?: MemoryStore | null): HostClass & CachingHost & typeof ConfigMethods {
  HostClass.config().clear();
  if (store) HostConfig.cacheStore = store;
  HostConfig.performCaching = true;
  HostConfig.defaultStaticExtension = ".html";
  HostClass._viewCacheDependencies = undefined;
  return new HostClass() as unknown as HostClass & CachingHost & typeof ConfigMethods;
}

describe("AbstractController::Caching", () => {
  describe("cacheStore reader/writer", () => {
    it("reads the class-level slot", () => {
      const store = new MemoryStore();
      const host = makeHost(store);
      expect(host.cacheStore).toBe(store);
    });
    it("returns null when no store is wired up", () => {
      expect(makeHost().cacheStore).toBeUndefined();
    });
    it("cacheStore= writes the instance's own inheritable config copy", () => {
      const host = makeHost();
      const store = new MemoryStore();
      host.cacheStore = store;
      expect(host.cacheStore).toBe(store);
      expect(HostConfig.cacheStore).toBeUndefined();
    });
    it("cacheStore= on the class resolves through Cache.lookup_store", () => {
      makeHost();
      HostConfig.cacheStore = ":memory_store";
      expect(HostConfig.cacheStore).toBeInstanceOf(MemoryStore);
    });
  });

  describe("cacheConfigured", () => {
    it("is false when no store is wired up", () => {
      expect(cacheConfigured(makeHost())).toBe(false);
    });
    it("is false when performCaching is off, even with a store", () => {
      const host = makeHost(new MemoryStore());
      HostConfig.performCaching = false;
      expect(cacheConfigured(host)).toBe(false);
    });
    it("is true when both are set", () => {
      expect(cacheConfigured(makeHost(new MemoryStore()))).toBe(true);
    });
    it("reads the instance's own store when only the instance carries one", () => {
      const host = makeHost();
      host.cacheStore = new MemoryStore();
      expect(cacheConfigured(host)).toBe(true);
    });
  });

  describe("viewCacheDependency / viewCacheDependencies", () => {
    it("evaluates dependency blocks in host context and drops nullish", () => {
      const host = makeHost();
      viewCacheDependency.call(HostClass, function (this: CachingHost) {
        return (this as unknown as HostClass).greeting;
      });
      viewCacheDependency.call(HostClass, () => null);
      viewCacheDependency.call(HostClass, () => "v2");
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
    it("fetches through a store set only on the instance", () => {
      const host = makeHost();
      const store = new MemoryStore();
      host.cacheStore = store;
      cache.call(host, "instance-page", () => "rendered");
      expect(store.read("controller/instance-page")).toBe("rendered");
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
