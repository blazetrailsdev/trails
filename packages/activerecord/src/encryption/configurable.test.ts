import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Configurable } from "./configurable.js";
import { Contexts } from "./contexts.js";
import { NullEncryptor } from "./null-encryptor.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { encrypts } from "./encryptable-record.js";
import { AttributeRegistration, Model } from "@blazetrails/activemodel";
import { include } from "@blazetrails/activesupport";
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
      excludedFromFilterParameters: [...c.excludedFromFilterParameters],
    };
  }

  beforeEach(() => {
    savedConfig = snapshotConfig();
    Configurable.config.previousSchemes.length = 0;
  });

  afterEach(() => {
    const c = Configurable.config;
    c.primaryKey = savedConfig.primaryKey;
    c.deterministicKey = savedConfig.deterministicKey;
    c.keyDerivationSalt = savedConfig.keyDerivationSalt;
    c.previousSchemes = savedConfig.previousSchemes;
    c.addToFilterParameters = savedConfig.addToFilterParameters;
    c.excludedFromFilterParameters = savedConfig.excludedFromFilterParameters;
    Contexts.resetDefaultContext();
  });

  it("can access context properties with top level getters", () => {
    expect(Configurable.keyProvider).toBe(Contexts.context.keyProvider);
  });

  it(".configure configures initial config properties", () => {
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
    expect(config.previousSchemes[0]).toMatchObject({ keyProvider: previousKeyProvider });
  });

  it("can add listeners that will get invoked when declaring encrypted attributes", () => {
    let capturedKlass: any = null;
    let capturedName: string | null = null;

    const dispose = Configurable.onEncryptedAttributeDeclared((klass, name) => {
      capturedKlass = klass;
      capturedName = name;
    });

    try {
      const modelClass = class extends Model {};
      include(modelClass, AttributeRegistration);
      encrypts.call(modelClass, "isbn");

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
      class NamedPirate extends Model {}
      const modelClass = NamedPirate;
      include(modelClass, AttributeRegistration);
      encrypts.call(modelClass, "catchphrase");

      expect(filterParameters).toContain("named_pirate.catchphrase");
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
      const modelClass = (() => class extends Model {})();
      include(modelClass, AttributeRegistration);
      encrypts.call(modelClass, "catchphrase");

      expect(filterParameters).toContain("catchphrase");
      expect(filterParameters.every((f) => !f.includes("."))).toBe(true);
    } finally {
      dispose();
    }
  });

  it("exclude the installation of autofiltered params", () => {
    Configurable.config.excludedFromFilterParameters = ["catchphrase"];

    const filterParameters: string[] = [];
    const autoFilteredParameters = new AutoFilteredParameters(filterParameters);
    autoFilteredParameters.enable();

    const dispose = Configurable.onEncryptedAttributeDeclared((klass, name) => {
      autoFilteredParameters.attributeWasDeclared(klass, name);
    });

    try {
      const modelClass = class extends Model {};
      include(modelClass, AttributeRegistration);
      encrypts.call(modelClass, "catchphrase");

      expect(filterParameters).toEqual([]);
    } finally {
      dispose();
      Configurable.config.excludedFromFilterParameters = [];
    }
  });

  it("configure resets the default context so config-derived properties are rebuilt", () => {
    const before = Contexts.defaultContext;
    Configurable.configure({ primaryKey: "test-key", keyDerivationSalt: "the salt" });
    expect(Contexts.defaultContext).not.toBe(before);
  });

  it("configure applies Context-only properties to the reset default context", () => {
    const encryptor = new NullEncryptor();
    Configurable.configure({ primaryKey: "test-key", keyDerivationSalt: "the salt", encryptor });
    expect(Contexts.context.encryptor).toBe(encryptor);
  });

  it("excludeFromFilterParameters excludes specific attributes while others are still filtered", () => {
    Configurable.config.excludedFromFilterParameters = ["secret_token"];

    const filterParameters: string[] = [];
    const autoFilteredParameters = new AutoFilteredParameters(filterParameters);
    autoFilteredParameters.enable();

    const dispose = Configurable.onEncryptedAttributeDeclared((klass, name) => {
      autoFilteredParameters.attributeWasDeclared(klass, name);
    });

    try {
      class PaymentModel extends Model {}
      const modelClass = PaymentModel;
      include(modelClass, AttributeRegistration);
      encrypts.call(modelClass, "card_number");
      encrypts.call(modelClass, "secret_token");

      expect(filterParameters).toContain("payment_model.card_number");
      expect(filterParameters).not.toContain("payment_model.secret_token");
    } finally {
      dispose();
    }
  });
});
