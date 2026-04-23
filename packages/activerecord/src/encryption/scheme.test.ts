import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Scheme } from "./scheme.js";
import { ConfigError } from "./errors.js";
import { Configurable } from "./configurable.js";
import { getEncryptionContext } from "./context.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { DeterministicKeyProvider } from "./deterministic-key-provider.js";

describe("ActiveRecord::Encryption::SchemeTest", () => {
  it("validates config options when using encrypted attributes", () => {
    expect(() => new Scheme({ ignoreCase: true, deterministic: false })).toThrow(ConfigError);
    expect(() => new Scheme({ downcase: true, deterministic: false })).toThrow(ConfigError);
    expect(() => new Scheme({ key: "k", keyProvider: {} })).toThrow(ConfigError);
    expect(
      () =>
        new Scheme({
          compressor: { deflate: () => Buffer.alloc(0), inflate: () => "" },
          encryptor: {
            encrypt: (v) => v,
            decrypt: (v) => v,
            isEncrypted: () => false,
            isBinary: () => false,
          },
        }),
    ).toThrow(ConfigError);
    expect(
      () =>
        new Scheme({
          compress: false,
          compressor: { deflate: () => Buffer.alloc(0), inflate: () => "" },
        }),
    ).toThrow(ConfigError);
  });

  it("keyProvider resolves from bare key: option via DerivedSecretKeyProvider, using config salt", () => {
    const originalSalt = Configurable.config.keyDerivationSalt;
    try {
      Configurable.config.keyDerivationSalt = "salt-one";
      const schemeA = new Scheme({ key: "mykey" });
      expect(schemeA.keyProvider).toBeInstanceOf(DerivedSecretKeyProvider);
      const secretA = (schemeA.keyProvider as DerivedSecretKeyProvider).encryptionKey().secret;

      Configurable.config.keyDerivationSalt = "salt-two";
      const schemeB = new Scheme({ key: "mykey" });
      const secretB = (schemeB.keyProvider as DerivedSecretKeyProvider).encryptionKey().secret;

      expect(secretA).toBeDefined();
      expect(secretB).toBeDefined();
      expect(secretA).not.toBe(secretB);
    } finally {
      Configurable.config.keyDerivationSalt = originalSalt;
    }
  });

  it("keyProvider resolves from deterministic: true via DeterministicKeyProvider when config.deterministicKey is set", () => {
    const originalKey = Configurable.config.deterministicKey;
    Configurable.config.deterministicKey = "det-key";
    try {
      const scheme = new Scheme({ deterministic: true });
      expect(scheme.keyProvider).toBeInstanceOf(DeterministicKeyProvider);
    } finally {
      Configurable.config.deterministicKey = originalKey;
    }
  });

  it("keyProvider raises ConfigError when deterministic: true but config.deterministicKey is not set", () => {
    const originalKey = Configurable.config.deterministicKey;
    Configurable.config.deterministicKey = undefined;
    try {
      const scheme = new Scheme({ deterministic: true });
      expect(() => scheme.keyProvider).toThrow(ConfigError);
    } finally {
      Configurable.config.deterministicKey = originalKey;
    }
  });

  it("keyProvider memoizes — returns same instance on repeated calls", () => {
    const originalSalt = Configurable.config.keyDerivationSalt;
    Configurable.config.keyDerivationSalt = "memo-salt";
    try {
      const scheme = new Scheme({ key: "mykey" });
      expect(scheme.keyProvider).toBe(scheme.keyProvider);
    } finally {
      Configurable.config.keyDerivationSalt = originalSalt;
    }
  });

  it("keyProvider returns undefined when no key/keyProvider/deterministic configured", () => {
    const scheme = new Scheme();
    expect(scheme.keyProvider).toBeUndefined();
  });

  it("should create a encryptor well when compressor is given", () => {
    const customCompressor = {
      deflate: (data: string) => Buffer.from(data),
      inflate: (data: Buffer | Uint8Array) => Buffer.from(data).toString("utf-8"),
    };
    const scheme = new Scheme({ compressor: customCompressor });
    expect(scheme.encryptor).toBeTruthy();
  });

  it("should create a encryptor well when compress is false", () => {
    const scheme = new Scheme({ compress: false });
    expect(scheme.encryptor).toBeTruthy();
  });

  describe("isSupportUnencryptedData", () => {
    let originalValue: boolean;
    beforeEach(() => {
      originalValue = Configurable.config.supportUnencryptedData;
      Configurable.config.supportUnencryptedData = false;
    });
    afterEach(() => {
      Configurable.config.supportUnencryptedData = originalValue;
    });

    it("falls back to config when not set on the scheme", () => {
      expect(new Scheme().isSupportUnencryptedData()).toBe(false);
      Configurable.config.supportUnencryptedData = true;
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
    expect(merged.encryptor).toBe(customEncryptor);
  });

  it("withContext calls block directly when no context properties are set", () => {
    const scheme = new Scheme();
    let ran = false;
    scheme.withContext(() => {
      ran = true;
      expect(getEncryptionContext().encryptor).toBeUndefined();
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
      encryptorInContext = getEncryptionContext().encryptor;
    });
    expect(encryptorInContext).toBe(customEncryptor);
    expect(getEncryptionContext().encryptor).toBeUndefined();
  });

  it("isCompatibleWith returns true when deterministic flags match", () => {
    const a = new Scheme({ deterministic: true });
    const b = new Scheme({ deterministic: true });
    const c = new Scheme({ deterministic: false });
    expect(a.isCompatibleWith(b)).toBe(true);
    expect(a.isCompatibleWith(c)).toBe(false);
  });
});
