import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KeyGenerator } from "./key-generator.js";
import { Configurable } from "./configurable.js";

describe("ActiveRecord::Encryption::KeyGeneratorTest", () => {
  it("generate_random_key generates random keys with the cipher key length by default", () => {
    const gen = new KeyGenerator();
    expect(gen.generateRandomKey()).not.toBe(gen.generateRandomKey());
    expect(Buffer.from(gen.generateRandomKey(), "base64").length).toBe(32);
  });

  it("generate_random_key generates random keys with a custom length", () => {
    const gen = new KeyGenerator();
    expect(gen.generateRandomKey(10)).not.toBe(gen.generateRandomKey(10));
    expect(Buffer.from(gen.generateRandomKey(10), "base64").length).toBe(10);
  });

  it("generate_random_hex_key generates random hexadecimal keys with the cipher key length by default", () => {
    const gen = new KeyGenerator();
    expect(gen.generateRandomHexKey()).not.toBe(gen.generateRandomHexKey());
    const key = gen.generateRandomHexKey();
    expect(key.length).toBe(64);
    expect(key).toMatch(/^[0-9a-f]+$/);
  });

  it("generate_random_hex_key generates random hexadecimal keys with a custom length", () => {
    const gen = new KeyGenerator();
    expect(gen.generateRandomHexKey(10)).not.toBe(gen.generateRandomHexKey(10));
    const key = gen.generateRandomHexKey(10);
    expect(key.length).toBe(20);
    expect(key).toMatch(/^[0-9a-f]+$/);
  });

  it("derive keys using the configured digest algorithm", () => {
    const gen256 = new KeyGenerator("SHA256");
    const genSha1 = new KeyGenerator("SHA1");
    const k1 = gen256.deriveKey("some secret");
    const k2 = genSha1.deriveKey("some secret");
    expect(k1).not.toBe(k2);
  });

  it("derive_key derives a key with from the provided password with the cipher key length by default", () => {
    const gen = new KeyGenerator();
    expect(gen.deriveKey("some password")).toBe(gen.deriveKey("some password"));
    expect(gen.deriveKey("some password")).not.toBe(gen.deriveKey("some other password"));
    expect(Buffer.from(gen.deriveKey("some password"), "base64").length).toBe(32);
  });

  it("derive_key derives a key with a custom length", () => {
    const gen = new KeyGenerator();
    expect(gen.deriveKey("some password", 12)).toBe(gen.deriveKey("some password", 12));
    expect(gen.deriveKey("some password", 12)).not.toBe(gen.deriveKey("some other password", 12));
    expect(Buffer.from(gen.deriveKey("some password", 12), "base64").length).toBe(12);
  });

  it("hash_digest_class reflects the configured digest", () => {
    expect(new KeyGenerator("SHA256").hashDigestClass).toBe("SHA256");
    expect(new KeyGenerator("SHA1").hashDigestClass).toBe("SHA1");
  });

  it("default hash_digest_class reads from config", () => {
    expect(new KeyGenerator().hashDigestClass).toBe(Configurable.config.hashDigestClass);
  });

  describe("derive_key_from", () => {
    let originalSalt: string | undefined;
    beforeEach(() => {
      originalSalt = Configurable.config.keyDerivationSalt;
      Configurable.config.keyDerivationSalt = "test-salt";
    });
    afterEach(() => {
      Configurable.config.keyDerivationSalt = originalSalt;
    });

    it("uses config.keyDerivationSalt as the salt", () => {
      const gen = new KeyGenerator("SHA256");
      expect(gen.deriveKeyFrom("password")).toBe(gen.deriveKey("password", 32, "test-salt"));
    });

    it("raises when config.keyDerivationSalt is not set", () => {
      Configurable.config.keyDerivationSalt = undefined;
      const gen = new KeyGenerator("SHA256");
      expect(() => gen.deriveKeyFrom("password")).toThrow();
    });

    it("produces a different key than empty-salt deriveKey", () => {
      const gen = new KeyGenerator("SHA256");
      expect(gen.deriveKeyFrom("password")).not.toBe(gen.deriveKey("password", 32, ""));
    });
  });
});
