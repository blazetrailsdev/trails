import { describe, it, expect, beforeEach } from "vitest";
import { ModelHelpers, normalizeModelName } from "./model-helpers.js";
import { GeneratorError } from "./generated-attribute.js";

describe("normalizeModelName", () => {
  beforeEach(() => {
    ModelHelpers.skipWarn = false;
  });

  it("singularizes plurals and warns once, honors forcePlural, suppresses subsequent warns", () => {
    const messages: string[] = [];
    expect(normalizeModelName("posts", {}, (m) => messages.push(m))).toBe("post");
    expect(messages[0]).toContain("'posts' was recognized as a plural");
    expect(ModelHelpers.skipWarn).toBe(true);

    const more: string[] = [];
    expect(normalizeModelName("comments", {}, (m) => more.push(m))).toBe("comment");
    expect(more).toEqual([]);

    ModelHelpers.skipWarn = false;
    expect(normalizeModelName("posts", { forcePlural: true })).toBe("posts");
  });

  it("raises GeneratorError on inflection-impossible names", () => {
    // "WIFI" trips the activesupport inflector's underscore round-trip
    // (`underscore("WIFI")` → "wifi" but `underscore("WIFIs")` → "wif_is"),
    // which is exactly Rails' inflection_impossible? check.
    expect(() => normalizeModelName("WIFI")).toThrow(GeneratorError);
  });
});
