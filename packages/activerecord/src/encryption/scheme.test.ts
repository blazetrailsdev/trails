import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "./index.js";
import { fixtures } from "../test-fixtures.js";
import { Book } from "../test-helpers/models/book.js";
import { Scheme } from "./scheme.js";
import { Encryptor } from "./encryptor.js";
import { Configuration } from "./errors.js";
import { Encryption } from "../encryption.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { DeterministicKeyProvider } from "./deterministic-key-provider.js";

function declareEncryptsWith(options: Record<string, unknown>): unknown {
  class Sub extends Book {}
  Sub.encrypts("name", options);
  return Sub.typeForAttribute("name");
}

function assertInvalidDeclaration(options: Record<string, unknown>): void {
  expect(() => declareEncryptsWith(options)).toThrow(Configuration);
}

function assertValidDeclaration(options: Record<string, unknown>): void {
  expect(() => declareEncryptsWith(options)).not.toThrow();
}

describe("ActiveRecord::Encryption::SchemeTest", () => {
  fixtures({});

  it("validates config options when using encrypted attributes", () => {
    const zlib = { deflate: () => Buffer.alloc(0), inflate: () => Buffer.alloc(0) };
    assertInvalidDeclaration({ deterministic: false, ignoreCase: true });
    assertInvalidDeclaration({
      key: "1234",
      keyProvider: new DerivedSecretKeyProvider("my secret"),
    });
    assertInvalidDeclaration({ compress: false, compressor: zlib });
    assertInvalidDeclaration({ compressor: zlib, encryptor: new Encryptor() });

    assertValidDeclaration({ deterministic: true });
    assertValidDeclaration({ key: "1234" });
    assertValidDeclaration({ keyProvider: new DerivedSecretKeyProvider("my secret") });
  });

  it("keyProvider resolves from bare key: option via DerivedSecretKeyProvider, using config salt", () => {
    const originalSalt = Encryption.config.keyDerivationSalt;
    try {
      Encryption.config.keyDerivationSalt = "salt-one";
      Encryption.resetDefaultContext();
      const schemeA = new Scheme({ key: "mykey" });
      expect(schemeA.keyProvider).toBeInstanceOf(DerivedSecretKeyProvider);
      const secretA = (schemeA.keyProvider as DerivedSecretKeyProvider).encryptionKey().secret;

      Encryption.config.keyDerivationSalt = "salt-two";
      Encryption.resetDefaultContext();
      const schemeB = new Scheme({ key: "mykey" });
      const secretB = (schemeB.keyProvider as DerivedSecretKeyProvider).encryptionKey().secret;

      expect(secretA).toBeDefined();
      expect(secretB).toBeDefined();
      expect(secretA).not.toBe(secretB);
    } finally {
      Encryption.config.keyDerivationSalt = originalSalt;
      Encryption.resetDefaultContext();
    }
  });

  it("keyProvider resolves from deterministic: true via DeterministicKeyProvider when config.deterministicKey is set", () => {
    const originalKey = Encryption.config.deterministicKey;
    const originalSalt = Encryption.config.keyDerivationSalt;
    Encryption.config.deterministicKey = "det-key";
    Encryption.config.keyDerivationSalt = "test-salt";
    try {
      const scheme = new Scheme({ deterministic: true });
      expect(scheme.keyProvider).toBeInstanceOf(DeterministicKeyProvider);
    } finally {
      Encryption.config.deterministicKey = originalKey;
      Encryption.config.keyDerivationSalt = originalSalt;
    }
  });

  it("keyProvider raises Configuration when deterministic: true but config.deterministicKey is not set", () => {
    const originalKey = Encryption.config.deterministicKey;
    Encryption.config.deterministicKey = undefined;
    try {
      const scheme = new Scheme({ deterministic: true });
      expect(() => scheme.keyProvider).toThrow(Configuration);
    } finally {
      Encryption.config.deterministicKey = originalKey;
    }
  });

  it("keyProvider memoizes — returns same instance on repeated calls", () => {
    const originalSalt = Encryption.config.keyDerivationSalt;
    Encryption.config.keyDerivationSalt = "memo-salt";
    try {
      const scheme = new Scheme({ key: "mykey" });
      expect(scheme.keyProvider).toBe(scheme.keyProvider);
    } finally {
      Encryption.config.keyDerivationSalt = originalSalt;
    }
  });

  it("keyProvider raises when no key/keyProvider/deterministic configured", () => {
    const c = Encryption.config;
    const saved = {
      primaryKey: c.primaryKey,
      deterministicKey: c.deterministicKey,
      keyDerivationSalt: c.keyDerivationSalt,
    };
    c.primaryKey = undefined;
    c.deterministicKey = undefined;
    c.keyDerivationSalt = undefined;
    Encryption.resetDefaultContext();
    try {
      expect(() => new Scheme().keyProvider).toThrow(
        "Missing Active Record encryption credential: active_record_encryption.primary_key",
      );
    } finally {
      c.primaryKey = saved.primaryKey;
      c.deterministicKey = saved.deterministicKey;
      c.keyDerivationSalt = saved.keyDerivationSalt;
      Encryption.resetDefaultContext();
    }
  });

  it("should create a encryptor well when compressor is given", () => {
    const customCompressor = {
      deflate: (data: string) => Buffer.from(data),
      inflate: (data: Buffer | Uint8Array) => Buffer.from(data),
    };
    const scheme = new Scheme({ compressor: customCompressor });
    expect((scheme.toH().encryptor as Encryptor).compressor).toBe(customCompressor);
  });

  it("should create a encryptor well when compress is false", () => {
    const scheme = new Scheme({ compress: false });
    expect((scheme.toH().encryptor as Encryptor).isCompress()).toBeFalsy();
  });

  describe("isSupportUnencryptedData", () => {
    let originalValue: boolean;
    beforeEach(() => {
      originalValue = Encryption.config.supportUnencryptedData;
      Encryption.config.supportUnencryptedData = false;
    });
    afterEach(() => {
      Encryption.config.supportUnencryptedData = originalValue;
    });

    it("falls back to config when not set on the scheme", () => {
      expect(new Scheme().isSupportUnencryptedData()).toBe(false);
      Encryption.config.supportUnencryptedData = true;
      expect(new Scheme().isSupportUnencryptedData()).toBe(true);
    });

    it("uses the scheme-level override when set", () => {
      expect(new Scheme({ supportUnencryptedData: true }).isSupportUnencryptedData()).toBe(true);
      expect(new Scheme({ supportUnencryptedData: false }).isSupportUnencryptedData()).toBe(false);
    });
  });

  it("isFixed returns true for deterministic schemes", () => {
    expect(new Scheme({ deterministic: true }).isFixed()).toBe(true);
    expect(new Scheme({ deterministic: false }).isFixed()).toBe(false);
  });

  it("merge produces a new scheme with overridden options", () => {
    const base = new Scheme({ deterministic: true });
    const override = new Scheme({ downcase: true, deterministic: true });
    const merged = base.merge(override);
    expect(merged.deterministic).toBe(true);
    expect(merged.downcase).toBe(true);
  });

  it("merge allows overriding deterministic: true with deterministic: false", () => {
    const base = new Scheme({ deterministic: true });
    const override = new Scheme({ deterministic: false });
    const merged = base.merge(override);
    expect(merged.deterministic).toBe(false);
  });

  it("merge preserves an explicit encryptor from the base scheme", () => {
    const customEncryptor = {
      encrypt: (v: string) => v,
      decrypt: (v: string) => v,
      isEncrypted: () => false,
      isBinary: () => false,
    };
    const base = new Scheme({ encryptor: customEncryptor });
    const override = new Scheme({ deterministic: true });
    const merged = base.merge(override);
    expect(merged.toH().encryptor).toBe(customEncryptor);
  });

  it("withContext calls block directly when no context properties are set", () => {
    const scheme = new Scheme();
    let ran = false;
    scheme.withContext(() => {
      ran = true;
      expect(Encryption.context.encryptor).toBeInstanceOf(Encryptor);
    });
    expect(ran).toBe(true);
  });

  it("withContext runs the callback with the scheme encryptor in context", () => {
    const customEncryptor = {
      encrypt: (v: string) => v,
      decrypt: (v: string) => v,
      isEncrypted: () => false,
      isBinary: () => false,
    };
    const scheme = new Scheme({ encryptor: customEncryptor });
    let encryptorInContext: unknown;
    scheme.withContext(() => {
      encryptorInContext = Encryption.context.encryptor;
    });
    expect(encryptorInContext).toBe(customEncryptor);
    expect(Encryption.context.encryptor).toBeInstanceOf(Encryptor);
  });

  it("isCompatibleWith returns true when deterministic flags match", () => {
    const a = new Scheme({ deterministic: true });
    const b = new Scheme({ deterministic: true });
    const c = new Scheme({ deterministic: false });
    expect(a.isCompatibleWith(b)).toBe(true);
    expect(a.isCompatibleWith(c)).toBe(false);
  });
});
