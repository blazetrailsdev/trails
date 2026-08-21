import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Configurable } from "./configurable.js";
import { Contexts } from "./contexts.js";
import { NullEncryptor } from "./null-encryptor.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { encrypts } from "./encryptable-record.js";
import { Model } from "@blazetrails/activemodel";
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
    // EncryptionTestCase#setup — helper.rb:141.
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
      // Named class: filter key is "underscore(ClassName).attribute"
      class NamedPirate extends Model {}
      const modelClass = NamedPirate;
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
      // Truly anonymous class (empty .name): filter key is just the attribute
      // name. Returned from a function so JS name inference doesn't kick in.
      const modelClass = (() => class extends Model {})();
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
    // configurable.rb:35-37 — the second `properties.each`, over `context`
    // rather than `config`. `encryptor` is a Context::PROPERTIES member
    // (context.rb:13) with no Config counterpart, so only that loop can set it.
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
      encrypts.call(modelClass, "card_number");
      encrypts.call(modelClass, "secret_token");

      // "card_number" is added; "secret_token" is excluded
      expect(filterParameters).toContain("payment_model.card_number");
      expect(filterParameters).not.toContain("payment_model.secret_token");
    } finally {
      dispose();
    }
  });
});
