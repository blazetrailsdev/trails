import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Configurable } from "./configurable.js";
import { Contexts } from "./contexts.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { EncryptableRecord } from "./encryptable-record.js";
import { AutoFilteredParameters } from "./auto-filtered-parameters.js";
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
      addToFilterParameters: c.addToFilterParameters,
      excludeFromFilterParameters: [...c.excludeFromFilterParameters],
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
    c.addToFilterParameters = savedConfig.addToFilterParameters;
    c.excludeFromFilterParameters = savedConfig.excludeFromFilterParameters;
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

  it("installing autofiltered parameters will add the encrypted attribute as a filter parameter using the dot notation", () => {
    const filterParameters: string[] = [];
    const autoFilteredParameters = new AutoFilteredParameters(filterParameters);
    autoFilteredParameters.enable();

    const dispose = Configurable.onEncryptedAttributeDeclared((klass, name) => {
      autoFilteredParameters.attributeWasDeclared(klass, name);
    });

    try {
      // Named class: filter key is "underscore(ClassName).attribute"
      class EncryptedPost {}
      const modelClass = Object.assign(EncryptedPost, { _attributeDefinitions: new Map() });
      EncryptableRecord.encrypts(modelClass, "title");

      expect(filterParameters).toContain("encrypted_post.title");
    } finally {
      dispose();
    }
  });

  it("installing autofiltered parameters will work with unnamed classes", () => {
    const filterParameters: string[] = [];
    const autoFilteredParameters = new AutoFilteredParameters(filterParameters);
    autoFilteredParameters.enable();

    const dispose = Configurable.onEncryptedAttributeDeclared((klass, name) => {
      autoFilteredParameters.attributeWasDeclared(klass, name);
    });

    try {
      // Truly anonymous class (empty .name): filter key is just the attribute name
      const modelClass = Object.assign(class {}, { _attributeDefinitions: new Map() });
      EncryptableRecord.encrypts(modelClass, "secret");

      expect(filterParameters).toContain("secret");
      expect(filterParameters.every((f) => !f.includes("."))).toBe(true);
    } finally {
      dispose();
    }
  });

  it("exclude the installation of autofiltered params", () => {
    Configurable.config.addToFilterParameters = false;

    const filterParameters: string[] = [];
    const autoFilteredParameters = new AutoFilteredParameters(filterParameters);
    autoFilteredParameters.enable();

    const dispose = Configurable.onEncryptedAttributeDeclared((klass, name) => {
      autoFilteredParameters.attributeWasDeclared(klass, name);
    });

    try {
      class AnotherModel {}
      const modelClass = Object.assign(AnotherModel, { _attributeDefinitions: new Map() });
      EncryptableRecord.encrypts(modelClass, "email");

      // addToFilterParameters = false → nothing is added
      expect(filterParameters).toHaveLength(0);
    } finally {
      dispose();
    }
  });

  it("excludeFromFilterParameters excludes specific attributes while others are still filtered", () => {
    Configurable.config.excludeFromFilterParameters = ["secret_token"];

    const filterParameters: string[] = [];
    const autoFilteredParameters = new AutoFilteredParameters(filterParameters);
    autoFilteredParameters.enable();

    const dispose = Configurable.onEncryptedAttributeDeclared((klass, name) => {
      autoFilteredParameters.attributeWasDeclared(klass, name);
    });

    try {
      class PaymentModel {}
      const modelClass = Object.assign(PaymentModel, { _attributeDefinitions: new Map() });
      EncryptableRecord.encrypts(modelClass, "card_number");
      EncryptableRecord.encrypts(modelClass, "secret_token");

      // "card_number" is added; "secret_token" is excluded
      expect(filterParameters).toContain("payment_model.card_number");
      expect(filterParameters).not.toContain("payment_model.secret_token");
    } finally {
      dispose();
    }
  });
});
