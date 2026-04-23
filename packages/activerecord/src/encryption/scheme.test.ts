import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Scheme } from "./scheme.js";
import { ConfigError } from "./errors.js";
import { Configurable } from "./configurable.js";
import { getEncryptionContext } from "./context.js";

describe("ActiveRecord::Encryption::SchemeTest", () => {
  it("validates config options when using encrypted attributes", () => {
    expect(() => new Scheme({ ignoreCase: true, deterministic: false })).toThrow(ConfigError);
    expect(() => new Scheme({ downcase: true, deterministic: false })).toThrow(ConfigError);
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
