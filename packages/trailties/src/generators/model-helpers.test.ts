import { describe, it, expect, beforeEach } from "vitest";
import { ModelHelpers, normalizeModelName } from "./model-helpers.js";

describe("normalizeModelName", () => {
  beforeEach(() => {
    ModelHelpers.skipWarn = false;
  });

  it("singularizes plurals, honors forcePlural, sets skipWarn", () => {
    const messages: string[] = [];
    expect(normalizeModelName("posts", {}, (m) => messages.push(m))).toBe("post");
    expect(messages[0]).toContain("'posts' was recognized as a plural");
    expect(ModelHelpers.skipWarn).toBe(true);

    ModelHelpers.skipWarn = false;
    expect(normalizeModelName("posts", { forcePlural: true })).toBe("posts");
  });
});
