import { describe, expect, it } from "vitest";
import { kernelHash } from "../lib/kernel-hash.js";
import { TypeError } from "../lib/type-error.js";

describe("kernelHash", () => {
  it("answers a hash itself, and an empty one for nil and []", () => {
    const hash = { a: 1 };
    expect(kernelHash(hash)).toBe(hash);
    expect(kernelHash(null)).toEqual({});
    expect(kernelHash([])).toEqual({});
  });

  it("raises TypeError for anything else", () => {
    expect(() => kernelHash("")).toThrow(TypeError);
    expect(() => kernelHash([1])).toThrow(TypeError);
    expect(() => kernelHash({ toHash: () => 1 })).toThrow(TypeError);
  });
});
