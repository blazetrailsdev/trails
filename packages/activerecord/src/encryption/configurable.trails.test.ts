import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Configurable } from "./configurable.js";
import { Context } from "./context.js";
import { Contexts } from "./contexts.js";

describe("ActiveRecord::Encryption::Configurable (trails)", () => {
  let saved: { primaryKey?: string | string[]; deterministicKey?: string; salt?: string };

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
    expect(Configurable.config.hasDeterministicKey()).toBeUndefined();
    expect(Configurable.config.hasKeyDerivationSalt()).toBe("the salt");
  });

  it("delegates every Context::PROPERTIES member to the context", () => {
    for (const name of Context.PROPERTIES) {
      expect(name in Configurable).toBe(true);
    }
    Contexts.withEncryptionContext({ frozenEncryption: true, keyGenerator: "kg" }, () => {
      expect(Configurable.frozenEncryption).toBe(true);
      expect(Configurable.keyGenerator).toBe("kg");
      expect(Configurable.cipher).toBe(Contexts.context.cipher);
      expect(Configurable.messageSerializer).toBe(Contexts.context.messageSerializer);
      expect(Configurable.encryptor).toBe(Contexts.context.encryptor);
      expect(Configurable.keyProvider).toBe(Contexts.context.keyProvider);
    });
  });
});
