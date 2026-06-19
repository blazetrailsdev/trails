import { describe, it, expect } from "vitest";
import { Entry } from "./entry.js";

describe("CacheEntryTest", () => {
  it.skip("expired");
  it.skip("initialize with expires at");

  it("uncompresses the value on access when compressed", () => {
    const value = { name: "Rails", widgets: Array.from({ length: 50 }, (_, i) => `widget-${i}`) };
    const entry = new Entry(value).compressed(1);
    expect(entry.isCompressed()).toBe(true);
    expect(entry.value).toEqual(value);
  });

  it("does not compress below the threshold", () => {
    const entry = new Entry("small").compressed(1024);
    expect(entry.isCompressed()).toBe(false);
    expect(entry.value).toBe("small");
  });

  it("preserves expires_at and version when compressing", () => {
    const value = "x".repeat(500);
    const original = new Entry(value, { expiresIn: 60, version: "v1" });
    const compressed = original.compressed(1);
    expect(compressed.isCompressed()).toBe(true);
    expect(compressed.expiresAt).toBe(original.expiresAt);
    expect(compressed.version).toBe("v1");
    expect(compressed.value).toBe(value);
  });
});
