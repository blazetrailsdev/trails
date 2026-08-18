import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KeyGenerator as AsKeyGenerator } from "@blazetrails/activesupport/key-generator";
import { KeyGenerator } from "./key-generator.js";
import { Configurable } from "./configurable.js";

// Mirrors the `assert_derive_key` helper in
// vendor/rails/activerecord/test/cases/encryption/key_generator_test.rb:47-53.
function assertDeriveKey(
  secret: string,
  { digestClass = "SHA256", length = 20 }: { digestClass?: string; length?: number } = {},
): void {
  const expectedDerivedKey = new AsKeyGenerator(secret, { hashDigestClass: digestClass })
    .generateKey(Configurable.config.keyDerivationSalt, length)
    .toString("base64");
  expect(Buffer.from(expectedDerivedKey, "base64").length).toBe(length);
  Configurable.config.hashDigestClass = digestClass;
  expect(new KeyGenerator(digestClass).deriveKeyFrom(secret, { length })).toBe(expectedDerivedKey);
}

describe("ActiveRecord::Encryption::KeyGeneratorTest", () => {
  // Rails' EncryptionTestCase restores the encryption config between tests;
  // assertDeriveKey writes hash_digest_class the way its Rails counterpart does.
  let originalHashDigestClass: string;
  beforeEach(() => {
    originalHashDigestClass = Configurable.config.hashDigestClass;
  });
  afterEach(() => {
    Configurable.config.hashDigestClass = originalHashDigestClass;
  });

  it("generate_random_key generates random keys with the cipher key length by default", () => {
    const gen = new KeyGenerator();
    expect(gen.generateRandomKey()).not.toBe(gen.generateRandomKey());
    expect(Buffer.from(gen.generateRandomKey(), "base64").length).toBe(32);
  });

  it("generate_random_key generates random keys with a custom length", () => {
    const gen = new KeyGenerator();
    expect(gen.generateRandomKey({ length: 10 })).not.toBe(gen.generateRandomKey({ length: 10 }));
    expect(Buffer.from(gen.generateRandomKey({ length: 10 }), "base64").length).toBe(10);
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
    expect(gen.generateRandomHexKey({ length: 10 })).not.toBe(
      gen.generateRandomHexKey({ length: 10 }),
    );
    const key = gen.generateRandomHexKey({ length: 10 });
    expect(key.length).toBe(20);
    expect(key).toMatch(/^[0-9a-f]+$/);
  });

  it("derive keys using the configured digest algorithm", () => {
    assertDeriveKey("some secret", { digestClass: "SHA1" });
    assertDeriveKey("some secret", { digestClass: "SHA256" });
  });

  it("derive_key derives a key with from the provided password with the cipher key length by default", () => {
    const gen = new KeyGenerator();
    expect(gen.deriveKeyFrom("some password")).toBe(gen.deriveKeyFrom("some password"));
    expect(gen.deriveKeyFrom("some password")).not.toBe(gen.deriveKeyFrom("some other password"));
    expect(Buffer.from(gen.deriveKeyFrom("some password"), "base64").length).toBe(32);
  });

  it("derive_key derives a key with a custom length", () => {
    const gen = new KeyGenerator();
    expect(gen.deriveKeyFrom("some password", { length: 12 })).toBe(
      gen.deriveKeyFrom("some password", { length: 12 }),
    );
    expect(gen.deriveKeyFrom("some password", { length: 12 })).not.toBe(
      gen.deriveKeyFrom("some other password", { length: 12 }),
    );
    expect(Buffer.from(gen.deriveKeyFrom("some password", { length: 12 }), "base64").length).toBe(
      12,
    );
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
      const expected = new AsKeyGenerator("password", { hashDigestClass: "SHA256" })
        .generateKey("test-salt", 32)
        .toString("base64");
      expect(gen.deriveKeyFrom("password")).toBe(expected);
    });

    it("raises when config.keyDerivationSalt is not set", () => {
      Configurable.config.keyDerivationSalt = undefined;
      const gen = new KeyGenerator("SHA256");
      expect(() => gen.deriveKeyFrom("password")).toThrow();
    });

    it("produces a different key for a different salt", () => {
      const gen = new KeyGenerator("SHA256");
      const withTestSalt = gen.deriveKeyFrom("password");
      Configurable.config.keyDerivationSalt = "other-salt";
      expect(gen.deriveKeyFrom("password")).not.toBe(withTestSalt);
    });
  });
});
