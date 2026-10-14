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

  it("urlsafe_base64 is unpadded URL-safe base64 over random_bytes(n)", () => {
    expect(SecureRandom.urlsafeBase64(32)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(SecureRandom.urlsafeBase64()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("urlsafe_base64 keeps the padding when asked", () => {
    expect(SecureRandom.urlsafeBase64(null, true)).toMatch(/^[A-Za-z0-9_-]{22}==$/);
  });

  it("bytes returns one character per byte", () => {
    expect(SecureRandom.bytes(20)).toHaveLength(20);
  });

  it("uuid sets the version 4 and variant bits over random_bytes(16)", () => {
    expect(SecureRandom.uuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("uuid raises NotImplementedError without a random device", () => {
    cryptoAdapterConfig.adapter = "no-such-random-device";
    try {
      expect(() => SecureRandom.uuid()).toThrow(NotImplementedError);
    } finally {
      cryptoAdapterConfig.adapter = null;
    }
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
