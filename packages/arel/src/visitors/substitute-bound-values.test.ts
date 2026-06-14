import { describe, it, expect } from "vitest";
import { substituteBoundValues } from "./substitute-bound-values.js";

describe("substituteBoundValues", () => {
  it("replaces `?` placeholders left-to-right with the rendered value", () => {
    const out = substituteBoundValues("a = ? AND b = ?", (_p, i) => `'v${i}'`);
    expect(out).toBe("a = 'v0' AND b = 'v1'");
  });

  it("replaces `$N` PostgreSQL placeholders by ordinal, not by N", () => {
    const out = substituteBoundValues("a = $1 AND b = $2", (_p, i) => String(i));
    expect(out).toBe("a = 0 AND b = 1");
  });

  it("passes the matched placeholder text so callers can keep it", () => {
    const out = substituteBoundValues("a = ? AND b = ?", (placeholder, i) =>
      i === 0 ? placeholder : "X",
    );
    expect(out).toBe("a = ? AND b = X");
  });

  it("returns the string unchanged when there are no placeholders", () => {
    expect(substituteBoundValues("a = 1", () => "X")).toBe("a = 1");
  });
});
