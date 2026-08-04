/**
 * Trails-only: `translate!` has no case of its own in i18n_test.rb — the gem
 * covers `raise: true` through the backend tests. Same for the
 * `@@normalized_key_cache` memoization (i18n.rb:439-442), which the gem never
 * asserts on directly.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { MissingTranslationData } from "./exceptions.js";
import { config, newDoubleNestedCache, normalizeKeys, resetConfig, translateBang } from "./i18n.js";
import { resetClassConfig } from "./config.js";
import { Simple } from "./backend/simple.js";

describe("I18n.translateBang", () => {
  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    config().backend = new Simple();
    config().enforceAvailableLocales = false;
  });

  it("raises MissingTranslationData for a bogus key", () => {
    expect(() => translateBang("bogus")).toThrow(MissingTranslationData);
  });
});

describe("I18n.newDoubleNestedCache", () => {
  it("returns an empty map whose values are maps", () => {
    const cache = newDoubleNestedCache();
    expect(cache.size).toBe(0);
    cache.set(".", new Map([["foo", ["foo"]]]));
    expect(cache.get(".")?.get("foo")).toEqual(["foo"]);
  });
});

describe("I18n.normalizeKeys memoization", () => {
  beforeEach(() => {
    resetConfig();
    resetClassConfig();
  });

  it("does not let a caller mutating its result corrupt the cached segments", () => {
    normalizeKeys(null, "foo.bar", null).push("baz");
    expect(normalizeKeys(null, "foo.bar", null)).toEqual(["foo", "bar"]);
  });

  it("keys the cache by separator", () => {
    expect(normalizeKeys(null, "foo.bar", null, ".")).toEqual(["foo", "bar"]);
    expect(normalizeKeys(null, "foo.bar", null, "|")).toEqual(["foo.bar"]);
  });

  it("falls back to the default separator when passed false", () => {
    expect(normalizeKeys(null, "foo.bar", null, false)).toEqual(["foo", "bar"]);
  });
});

/**
 * Trails-only: the gem gets this from `Symbol#to_s` in `normalize_key`
 * (i18n.rb:447), so it has no case of its own. Our Symbol spelling is a
 * colon-prefixed string, and this is the one place that colon is dropped.
 */
describe("I18n.normalizeKeys on a Symbol key", () => {
  beforeEach(() => {
    resetConfig();
    resetClassConfig();
  });

  it("drops the leading colon of a Symbol key, scope and locale", () => {
    expect(normalizeKeys(null, ":errors.format", null)).toEqual(["errors", "format"]);
    expect(normalizeKeys(null, "format", ":errors")).toEqual(["errors", "format"]);
    expect(normalizeKeys(":en" as never, "format", null)).toEqual(["en", "format"]);
  });

  it("drops the leading colon of each Symbol in an Array key", () => {
    expect(normalizeKeys(null, [":errors", "format"], null)).toEqual(["errors", "format"]);
  });
});
