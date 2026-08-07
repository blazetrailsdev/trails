/**
 * Mirrors: i18n/lib/i18n/backend/flatten.rb:89-94 — `store_link` and
 * `resolve_link` both normalize the locale through `to_sym`, so a link stored
 * under one spelling of the locale is visible to a lookup under the other.
 * The gem has no test for this (the Symbol type makes it unobservable in
 * Ruby); trails spells a Symbol as a `":en"` string, so it needs one.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { KeyValue, type Store } from "./key-value.js";

describe("I18nBackendFlattenTrailsTest", () => {
  let backend: KeyValue;

  beforeEach(() => {
    backend = new KeyValue(new Map<string, string>() as Store);
  });

  it("store_link normalizes the locale through to_sym", () => {
    backend.storeLink(":en", "foo.bar", ":foo.baz");

    expect(backend.resolveLink("en", "foo.bar")).toBe("foo.baz");
    expect(backend.resolveLink(":en", "foo.bar")).toBe("foo.baz");
  });

  it("resolve_link normalizes the locale through to_sym", () => {
    backend.storeLink("en", "foo.bar", ":foo.baz");

    expect(backend.resolveLink(":en", "foo.bar")).toBe("foo.baz");
    expect(backend.links().get("en")?.get("foo.bar")).toBe("foo.baz");
    expect(backend.links().get(":en")).toBeUndefined();
  });
});
