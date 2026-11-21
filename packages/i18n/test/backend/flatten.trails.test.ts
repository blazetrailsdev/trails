import { beforeEach, describe, expect, it } from "vitest";
import { KeyValue } from "../../lib/backend/key-value.js";

describe("I18nBackendFlattenTrailsTest", () => {
  let backend: KeyValue;

  beforeEach(() => {
    backend = new KeyValue(new Map<string, string>());
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
