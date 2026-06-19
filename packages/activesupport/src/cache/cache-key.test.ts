import { describe, it, expect } from "vitest";
import { expandCacheKey } from "./expand-cache-key.js";
import { Entry } from "./entry.js";
import { setEnv, env } from "../process-adapter.js";

describe("CacheKeyTest", () => {
  it("entry legacy optional ivars", () => {
    class LegacyEntry extends Entry {
      constructor(value: unknown) {
        super(value, { expiresIn: null, createdAt: null });
      }
    }
    const entry = new LegacyEntry("foo");
    expect(entry.value).toBe("foo");
  });

  it("expand cache key", () => {
    expect(expandCacheKey([1, "2", true])).toBe("1/2/true");
    expect(expandCacheKey([1, "2", true], "name")).toBe("name/1/2/true");
  });

  describe("with env vars", () => {
    const saved: Record<string, string | undefined> = {};

    function withEnv(kv: Record<string, string>, fn: () => void) {
      for (const [k, v] of Object.entries(kv)) {
        saved[k] = env[k];
        setEnv(k, v);
      }
      try {
        fn();
      } finally {
        for (const k of Object.keys(kv)) {
          setEnv(k, saved[k]);
        }
      }
    }

    it("expand cache key with rails cache id", () => {
      withEnv({ RAILS_CACHE_ID: "c99" }, () => {
        expect(expandCacheKey("foo")).toBe("c99/foo");
        expect(expandCacheKey(["foo"])).toBe("c99/foo");
        expect(expandCacheKey(["foo", "bar"])).toBe("c99/foo/bar");
        expect(expandCacheKey("foo", "nm")).toBe("nm/c99/foo");
        expect(expandCacheKey(["foo"], "nm")).toBe("nm/c99/foo");
        expect(expandCacheKey(["foo", "bar"], "nm")).toBe("nm/c99/foo/bar");
      });
    });

    it("expand cache key with rails app version", () => {
      withEnv({ RAILS_APP_VERSION: "rails3" }, () => {
        expect(expandCacheKey("foo")).toBe("rails3/foo");
      });
    });

    it("expand cache key rails cache id should win over rails app version", () => {
      withEnv({ RAILS_CACHE_ID: "c99", RAILS_APP_VERSION: "rails3" }, () => {
        expect(expandCacheKey("foo")).toBe("c99/foo");
      });
    });
  });

  it("expand cache key respond to cache key", () => {
    const key = Object.assign("foo", {
      cacheKey() {
        return "foo_key";
      },
    });
    expect(expandCacheKey(key)).toBe("foo_key");
  });

  it("expand cache key array with something that responds to cache key", () => {
    const key = Object.assign("foo", {
      cacheKey() {
        return "foo_key";
      },
    });
    expect(expandCacheKey([key])).toBe("foo_key");
  });

  it("expand cache key of nil", () => {
    expect(expandCacheKey(null)).toBe("");
  });

  it("expand cache key of false", () => {
    expect(expandCacheKey(false)).toBe("false");
  });

  it("expand cache key of true", () => {
    expect(expandCacheKey(true)).toBe("true");
  });

  it("expand cache key of array like object", () => {
    expect(expandCacheKey(["foo", "bar", "baz"].values())).toBe("foo/bar/baz");
  });
});
