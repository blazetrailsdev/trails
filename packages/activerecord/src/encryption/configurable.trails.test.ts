import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Configurable } from "./configurable.js";
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
    const c = Configurable.config;
    saved = {
      primaryKey: c.hasPrimaryKey(),
      deterministicKey: c.hasDeterministicKey(),
      salt: c.hasKeyDerivationSalt(),
    };
  });

  afterEach(() => {
    const c = Configurable.config;
    c.primaryKey = saved.primaryKey;
    c.deterministicKey = saved.deterministicKey;
    c.keyDerivationSalt = saved.salt;
  });

  it("clears an omitted credential, as configurable.rb:21-23 does", () => {
    Configurable.configure({
      primaryKey: "the primary key",
      deterministicKey: "the deterministic key",
      keyDerivationSalt: "the salt",
    });
    expect(Configurable.config.hasDeterministicKey()).toBe("the deterministic key");

    Configurable.configure({ primaryKey: "another primary key", keyDerivationSalt: "the salt" });
    expect(Configurable.config.hasPrimaryKey()).toBe("another primary key");
    expect(Configurable.config.hasDeterministicKey()).toBeNull();
    expect(Configurable.config.hasKeyDerivationSalt()).toBe("the salt");
  });

  it("delegates every Context::PROPERTIES member to the context", () => {
    for (const name of Context.PROPERTIES) {
      expect(name in Configurable).toBe(true);
    }
    const keyGenerator = new KeyGenerator();
    Encryption.withEncryptionContext({ frozenEncryption: true, keyGenerator }, () => {
      expect(Configurable.frozenEncryption).toBe(true);
      expect(Configurable.keyGenerator).toBe(keyGenerator);
      expect(Configurable.cipher).toBe(Encryption.context.cipher);
      expect(Configurable.messageSerializer).toBe(Encryption.context.messageSerializer);
      expect(Configurable.encryptor).toBe(Encryption.context.encryptor);
      expect(Configurable.keyProvider).toBe(Encryption.context.keyProvider);
    });
  });

  it("sends each property to its Config or Context writer", () => {
    const previousSchemes = Configurable.config.previousSchemes;
    const context = Encryption.defaultContext;
    try {
      Configurable.config.previousSchemes = [];
      Configurable.configure({
        primaryKey: "the primary key",
        keyDerivationSalt: "the salt",
        supportSha1ForNonDeterministicEncryption: true,
        previous: [{ deterministic: true }],
        storeKeyReferences: true,
        frozenEncryption: true,
      });

      expect(Configurable.config.previousSchemes.length).toBe(2);
      expect(Configurable.config.storeKeyReferences).toBe(true);
      expect(Encryption.defaultContext.frozenEncryption).toBe(true);
    } finally {
      Configurable.config.previousSchemes = previousSchemes;
      Configurable.config.storeKeyReferences = false;
      Encryption.defaultContext = context;
    }
  });
});
