import { describe, it, expect } from "vitest";
import { except } from "./hash.js";
import { rbHash } from "./rb-hash.js";

describe("rbHash", () => {
  it("hashes a Uint8Array by its bytes, as rbEqual compares it", () => {
    expect(rbHash(new Uint8Array([1, 2]))).toBe(rbHash(new Uint8Array([1, 2])));
    expect(rbHash(new Uint8Array([1, 2]))).not.toBe(rbHash(new Uint8Array([2, 1])));
  });

  it("hashes an ancestor-less Hash by its pairs, as rbEqual compares it", () => {
    const hash = Object.assign(Object.create(null) as Record<string, number>, { count: 5 });

    expect(rbHash(hash)).toBe(rbHash({ count: 5 }));
    expect(rbHash(except({ count: 5, if: "admin" }, "if"))).toBe(rbHash({ count: 5 }));
  });
});
