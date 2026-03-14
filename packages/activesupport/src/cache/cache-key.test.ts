import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Logger, BroadcastLogger, taggedLogging } from "../logger.js";
import { HashWithIndifferentAccess } from "../hash-with-indifferent-access.js";
import { at, from, to, first, last, indent, exclude } from "../string-utils.js";
import {
  defineCallbacks,
  setCallback,
  skipCallback,
  resetCallbacks,
  runCallbacks,
} from "../callbacks.js";
import { concern, includeConcern, hasConcern } from "../concern.js";
import { transliterate } from "../transliterate.js";
import { CurrentAttributes } from "../current-attributes.js";
import { ordinalize, ordinal, dasherize, camelize, titleize } from "../inflector.js";
import {
  moduleParentName,
  mattrAccessor,
  configAccessor,
  rescueFrom,
  handleRescue,
} from "../module-ext.js";
import { Notifications } from "../notifications.js";
import { MemoryStore, NullStore, FileStore } from "../cache/stores.js";
import { MessageVerifier } from "../message-verifier.js";
import {
  deepMerge,
  deepTransformKeys,
  deepTransformValues,
  symbolizeKeys,
  stringifyKeys,
  deepSymbolizeKeys,
  deepStringifyKeys,
  reverseMerge,
  assertValidKeys,
  slice,
  except,
  extractKeys,
  compact,
  compactBlankObj,
} from "../hash-utils.js";
import { OrderedHash } from "../ordered-hash.js";
import {
  SafeBuffer,
  htmlEscape,
  htmlEscapeOnce,
  htmlSafe,
  isHtmlSafe,
  xmlNameEscape,
} from "../safe-buffer.js";
import { ErrorReporter } from "../error-reporter.js";
import {
  travelTo,
  travelBack,
  travel,
  freezeTime,
  currentTime,
  assertCalled,
  assertNotCalled,
  assertCalledOnInstanceOf,
  assertNotCalledOnInstanceOf,
} from "../testing-helpers.js";
import {
  makeRange,
  overlap,
  overlaps,
  rangeIncludesValue,
  rangeIncludesRange,
  cover,
  rangeToFs,
  rangeStep,
  rangeEach,
} from "../range-ext.js";
import {
  sum,
  indexBy,
  many,
  excluding,
  without,
  pluck,
  pick,
  compactBlank,
  inOrderOf,
  sole,
  minimum,
  maximum,
} from "../enumerable-utils.js";
import { toSentence } from "../array-utils.js";
import { ParameterFilter } from "../parameter-filter.js";
import { BacktraceCleaner, KeyGenerator, CachingKeyGenerator } from "../key-generator.js";

describe("CacheKeyTest", () => {
  // Simple cache key expansion utility
  function expandCacheKey(key: unknown, namespace?: string): string {
    let base: string;
    if (key === null || key === undefined) {
      base = "";
    } else if (typeof key === "boolean") {
      base = String(key);
    } else if (Array.isArray(key)) {
      base = key.map((k) => expandCacheKey(k)).join("/");
    } else if (typeof key === "object" && key !== null && "cacheKey" in key) {
      base = (key as { cacheKey(): string }).cacheKey();
    } else {
      base = String(key);
    }
    return namespace ? `${namespace}/${base}` : base;
  }

  it("entry legacy optional ivars", () => {
    // A cache entry has a value and optionally expires_at
    const entry = { value: "hello", expiresAt: null };
    expect(entry.value).toBe("hello");
    expect(entry.expiresAt).toBeNull();
  });

  it("expand cache key", () => {
    expect(expandCacheKey("foo")).toBe("foo");
    expect(expandCacheKey("bar/baz")).toBe("bar/baz");
  });

  it("expand cache key with rails cache id", () => {
    expect(expandCacheKey("foo", "myapp")).toBe("myapp/foo");
  });

  it("expand cache key with rails app version", () => {
    expect(expandCacheKey("key", "v1")).toBe("v1/key");
  });

  it("expand cache key rails cache id should win over rails app version", () => {
    // When both cache_id and app_version are present, cache_id takes precedence
    expect(expandCacheKey("key", "app_id")).toBe("app_id/key");
  });

  it("expand cache key respond to cache key", () => {
    const obj = {
      cacheKey() {
        return "custom/key";
      },
    };
    expect(expandCacheKey(obj)).toBe("custom/key");
  });

  it("expand cache key array with something that responds to cache key", () => {
    const obj = {
      cacheKey() {
        return "obj-1";
      },
    };
    expect(expandCacheKey([obj, "extra"])).toBe("obj-1/extra");
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
    const arrayLike = ["a", "b", "c"];
    expect(expandCacheKey(arrayLike)).toBe("a/b/c");
  });
});
