import { describe, it, expect } from "vitest";
import { rbEqual } from "./rb-equal.js";

describe("rbEqual over the values a Ruby binary String stands in for", () => {
  it("compares Uint8Array byte strings by value", () => {
    expect(rbEqual(new Uint8Array([0x80, 0xde]), new Uint8Array([0x80, 0xde]))).toBe(true);
    expect(rbEqual(new Uint8Array([0x80, 0xde]), new Uint8Array([0x80, 0x01]))).toBe(false);
    expect(rbEqual(new Uint8Array([0x80]), new Uint8Array([0x80, 0xde]))).toBe(false);
    expect(rbEqual(new Uint8Array([]), new Uint8Array([]))).toBe(true);
    expect(rbEqual(new Uint8Array([0x80]), "")).toBe(false);
  });
});
