import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Configurable } from "./configurable.js";
import { Contexts } from "./contexts.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { EncryptableRecord } from "./encryptable-record.js";
import type { SchemeOptions } from "./scheme.js";

describe("ActiveRecord::Encryption::ConfigurableTest", () => {
  let savedConfig: ReturnType<typeof snapshotConfig>;

  function snapshotConfig() {
    const c = Configurable.config;
    return {
      primaryKey: c.primaryKey,
      deterministicKey: c.deterministicKey,
      keyDerivationSalt: c.keyDerivationSalt,
      previousSchemes: [...c.previousSchemes],
    };
  }

  beforeEach(() => {
    savedConfig = snapshotConfig();
  });

  afterEach(() => {
    const c = Configurable.config;
    c.primaryKey = savedConfig.primaryKey;
    c.deterministicKey = savedConfig.deterministicKey;
    c.keyDerivationSalt = savedConfig.keyDerivationSalt;
    c.previousSchemes = savedConfig.previousSchemes;
    Contexts.resetDefaultContext();
  });

  it("can access context properties with top level getters", () => {
    // Set salt so DerivedSecretKeyProvider can run PBKDF2.
    Configurable.config.keyDerivationSalt = "the salt";
    const keyProvider = new DerivedSecretKeyProvider("some secret");

    expect(Configurable.keyProvider).toBeUndefined();

    Contexts.withEncryptionContext({ keyProvider }, () => {
      expect(Configurable.keyProvider).toBe(keyProvider);
    });

    expect(Configurable.keyProvider).toBeUndefined();
  });

  it(".configure configures initial config properties", () => {
    // Set salt first so DerivedSecretKeyProvider can run PBKDF2 in its constructor.
    Configurable.config.keyDerivationSalt = "the salt";
    const previousKeyProvider = new DerivedSecretKeyProvider("some secret");

    Configurable.configure({
      primaryKey: "the primary key",
      deterministicKey: "the deterministic key",
      keyDerivationSalt: "the salt",
      previous: [{ keyProvider: previousKeyProvider } as SchemeOptions],
    });

    const config = Configurable.config;
    expect(config.primaryKey).toBe("the primary key");
    expect(config.deterministicKey).toBe("the deterministic key");
    expect(config.keyDerivationSalt).toBe("the salt");
    expect(config.previousSchemes[config.previousSchemes.length - 1]).toMatchObject({
      keyProvider: previousKeyProvider,
    });
  });

  it("can add listeners that will get invoked when declaring encrypted attributes", () => {
    let capturedKlass: any = null;
    let capturedName: string | null = null;

    const dispose = Configurable.onEncryptedAttributeDeclared((klass, name) => {
      capturedKlass = klass;
      capturedName = name;
    });

    try {
      const modelClass = { _attributeDefinitions: new Map() };
      EncryptableRecord.encrypts(modelClass, "isbn");

      expect(capturedKlass).toBe(modelClass);
      expect(capturedName).toBe("isbn");
    } finally {
      dispose();
    }
  });

  it.skip("installing autofiltered parameters will add the encrypted attribute as a filter parameter using the dot notation", () => {});
  it.skip("installing autofiltered parameters will work with unnamed classes", () => {});
  it.skip("exclude the installation of autofiltered params", () => {});
});
