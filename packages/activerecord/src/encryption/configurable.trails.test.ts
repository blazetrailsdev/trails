import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Context } from "./context.js";
import { KeyGenerator } from "./key-generator.js";
import { Encryption } from "../encryption.js";

describe("ActiveRecord::Encryption::Configurable (trails)", () => {
  let saved: {
    primaryKey?: string | string[] | null;
    deterministicKey?: string | null;
    salt?: string | null;
  };

  beforeEach(() => {
    const c = Encryption.config;
    saved = {
      primaryKey: c.hasPrimaryKey(),
      deterministicKey: c.hasDeterministicKey(),
      salt: c.hasKeyDerivationSalt(),
    };
  });

  afterEach(() => {
    const c = Encryption.config;
    c.primaryKey = saved.primaryKey;
    c.deterministicKey = saved.deterministicKey;
    c.keyDerivationSalt = saved.salt;
  });

  it("clears an omitted credential, as configurable.rb:21-23 does", () => {
    Encryption.configure({
      primaryKey: "the primary key",
      deterministicKey: "the deterministic key",
      keyDerivationSalt: "the salt",
    });
    expect(Encryption.config.hasDeterministicKey()).toBe("the deterministic key");

    Encryption.configure({ primaryKey: "another primary key", keyDerivationSalt: "the salt" });
    expect(Encryption.config.hasPrimaryKey()).toBe("another primary key");
    expect(Encryption.config.hasDeterministicKey()).toBeNull();
    expect(Encryption.config.hasKeyDerivationSalt()).toBe("the salt");
  });

  it("delegates every Context::PROPERTIES member to the context", () => {
    for (const name of Context.PROPERTIES) {
      expect(name in Encryption).toBe(true);
    }
    const keyGenerator = new KeyGenerator();
    Encryption.withEncryptionContext({ frozenEncryption: true, keyGenerator }, () => {
      expect(Encryption.frozenEncryption).toBe(true);
      expect(Encryption.keyGenerator).toBe(keyGenerator);
      expect(Encryption.cipher).toBe(Encryption.context.cipher);
      expect(Encryption.messageSerializer).toBe(Encryption.context.messageSerializer);
      expect(Encryption.encryptor).toBe(Encryption.context.encryptor);
      expect(Encryption.keyProvider).toBe(Encryption.context.keyProvider);
    });
  });

  it("sends each property to its Config or Context writer", () => {
    const previousSchemes = Encryption.config.previousSchemes;
    const context = Encryption.defaultContext;
    try {
      Encryption.config.previousSchemes = [];
      Encryption.configure({
        primaryKey: "the primary key",
        keyDerivationSalt: "the salt",
        supportSha1ForNonDeterministicEncryption: true,
        previous: [{ deterministic: true }],
        storeKeyReferences: true,
        frozenEncryption: true,
      });

      expect(Encryption.config.previousSchemes.length).toBe(2);
      expect(Encryption.config.storeKeyReferences).toBe(true);
      expect(Encryption.defaultContext.frozenEncryption).toBe(true);
    } finally {
      Encryption.config.previousSchemes = previousSchemes;
      Encryption.config.storeKeyReferences = false;
      Encryption.defaultContext = context;
    }
  });

  it("skips a property neither Config nor Context has a writer for", () => {
    const context = Encryption.defaultContext;
    try {
      Encryption.configure({
        primaryKey: "the primary key",
        keyDerivationSalt: "the salt",
        noSuchProperty: "ignored",
      });

      expect("noSuchProperty" in Encryption.config).toBe(false);
      expect("noSuchProperty" in Encryption.defaultContext).toBe(false);
    } finally {
      Encryption.defaultContext = context;
    }
  });
});
