import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KeyGenerator as AsKeyGenerator } from "@blazetrails/activesupport/key-generator";
import { OpenSSL } from "@blazetrails/ruby-compat";
import { KeyGenerator } from "./key-generator.js";
import { Encryption } from "../encryption.js";

describe("ActiveRecord::Encryption::KeyGeneratorTest (trails)", () => {
  it("hash_digest_class reflects the configured digest", () => {
    expect(new KeyGenerator({ hashDigestClass: OpenSSL.Digest.SHA256 }).hashDigestClass).toBe(
      OpenSSL.Digest.SHA256,
    );
    expect(new KeyGenerator({ hashDigestClass: OpenSSL.Digest.SHA1 }).hashDigestClass).toBe(
      OpenSSL.Digest.SHA1,
    );
  });

  it("default hash_digest_class reads from config", () => {
    expect(new KeyGenerator().hashDigestClass).toBe(Encryption.config.hashDigestClass);
  });

  describe("derive_key_from", () => {
    let originalSalt: string | undefined;
    beforeEach(() => {
      originalSalt = Encryption.config.keyDerivationSalt;
      Encryption.config.keyDerivationSalt = "test-salt";
    });
    afterEach(() => {
      Encryption.config.keyDerivationSalt = originalSalt;
    });

    it("uses config.keyDerivationSalt as the salt", () => {
      const gen = new KeyGenerator({ hashDigestClass: OpenSSL.Digest.SHA256 });
      const expected = new AsKeyGenerator("password", { hashDigestClass: OpenSSL.Digest.SHA256 })
        .generateKey("test-salt", 32)
        .toString("base64");
      expect(gen.deriveKeyFrom("password")).toBe(expected);
    });

    it("raises when config.keyDerivationSalt is not set", () => {
      Encryption.config.keyDerivationSalt = undefined;
      const gen = new KeyGenerator({ hashDigestClass: OpenSSL.Digest.SHA256 });
      expect(() => gen.deriveKeyFrom("password")).toThrow();
    });

    it("produces a different key for a different salt", () => {
      const gen = new KeyGenerator({ hashDigestClass: OpenSSL.Digest.SHA256 });
      const withTestSalt = gen.deriveKeyFrom("password");
      Encryption.config.keyDerivationSalt = "other-salt";
      expect(gen.deriveKeyFrom("password")).not.toBe(withTestSalt);
    });
  });
});
