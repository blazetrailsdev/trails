import { describe, it, expect } from "vitest";
import { rbHash } from "./rb-hash.js";

describe("rbHash", () => {
  it("hashes a Uint8Array by its bytes, as rbEqual compares it", () => {
    expect(rbHash(new Uint8Array([1, 2]))).toBe(rbHash(new Uint8Array([1, 2])));
    expect(rbHash(new Uint8Array([1, 2]))).not.toBe(rbHash(new Uint8Array([2, 1])));
  });
});
