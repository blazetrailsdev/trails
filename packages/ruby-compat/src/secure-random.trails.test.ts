import { describe, expect, it } from "vitest";

import { cryptoAdapterConfig } from "./crypto-adapter.js";
import { NotImplementedError } from "./not-implemented-error.js";
import { SecureRandom } from "./secure-random.js";

describe("SecureRandom", () => {
  it("hex returns twice as many hex characters as bytes asked for", () => {
    expect(SecureRandom.hex(8)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("hex assumes 16 bytes when n is not given", () => {
    expect(SecureRandom.hex()).toMatch(/^[0-9a-f]{32}$/);
    expect(SecureRandom.hex(null)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("bytes returns one character per byte", () => {
    expect(SecureRandom.bytes(20)).toHaveLength(20);
  });

  it("gen_random raises NotImplementedError without a random device", () => {
    cryptoAdapterConfig.adapter = "no-such-random-device";
    try {
      expect(() => SecureRandom.genRandom(4)).toThrow(NotImplementedError);
    } finally {
      cryptoAdapterConfig.adapter = null;
    }
  });
});
