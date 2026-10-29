import { describe, it, expect } from "vitest";
import { stringValue } from "./support.js";

describe("stringValue", () => {
  it("keeps a leading byte-order mark in a binary String", () => {
    expect(stringValue(Uint8Array.of(0xef, 0xbb, 0xbf, 0x61))).toBe("\u{feff}a");
  });
});
