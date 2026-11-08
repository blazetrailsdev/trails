import { describe, it, expect } from "vitest";
import { mbChars } from "../lib/core-ext/string/multibyte.js";
import type { Chars } from "../lib/multibyte/chars.js";

describe("Chars#length", () => {
  it("counts characters as String#length does, not UTF-16 units", () => {
    expect((mbChars("😀a") as Chars & { length: number }).length).toBe(2);
  });
});
