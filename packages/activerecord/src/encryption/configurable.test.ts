import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Encryption } from "../encryption.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { encrypts } from "./encryptable-record.js";
import { AttributeRegistration, Model } from "@blazetrails/activemodel";
import { include } from "@blazetrails/activesupport";
import { AutoFilteredParameters } from "./auto-filtered-parameters.js";
import type { SchemeOptions } from "./scheme.js";

describe("ActiveRecord::Encryption::ConfigurableTest", () => {
  let savedConfig: ReturnType<typeof snapshotConfig>;

  function snapshotConfig() {
    const c = Encryption.config;
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
    Encryption.config.previousSchemes.length = 0;
  });

  afterEach(() => {
    const c = Encryption.config;
    c.primaryKey = savedConfig.primaryKey;
    c.deterministicKey = savedConfig.deterministicKey;
    c.keyDerivationSalt = savedConfig.keyDerivationSalt;
    c.previousSchemes = savedConfig.previousSchemes;
    c.addToFilterParameters = savedConfig.addToFilterParameters;
    c.excludedFromFilterParameters = savedConfig.excludedFromFilterParameters;
    Encryption.resetDefaultContext();
  });

  it("can access context properties with top level getters", () => {
    expect(Encryption.keyProvider).toBe(Encryption.context.keyProvider);
  });

  it(".configure configures initial config properties", () => {
    const previousKeyProvider = new DerivedSecretKeyProvider("some secret");

    Encryption.configure({
      primaryKey: "the primary key",
      deterministicKey: "the deterministic key",
      keyDerivationSalt: "the salt",
      previous: [{ keyProvider: previousKeyProvider } as SchemeOptions],
    });

    const config = Encryption.config;
    expect(config.primaryKey).toBe("the primary key");
    expect(config.deterministicKey).toBe("the deterministic key");
    expect(config.keyDerivationSalt).toBe("the salt");
    expect(config.previousSchemes[0].keyProvider).toEqual(previousKeyProvider);
  });

  it("can add listeners that will get invoked when declaring encrypted attributes", () => {
    let capturedKlass: any = null;
    let capturedName: string | null = null;

    const listeners = Encryption.onEncryptedAttributeDeclared((klass, name) => {
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
      listeners.pop();
    }
  });

  it("installing autofiltered parameters will add the encrypted attribute as a filter parameter using the dot notation", () => {
    const filterParameters: string[] = [];
    const autoFilteredParameters = new AutoFilteredParameters({ config: { filterParameters } });
    autoFilteredParameters.enable();

    const listeners = Encryption.onEncryptedAttributeDeclared((klass, name) => {
      autoFilteredParameters.attributeWasDeclared(klass, name);
    });

    try {
      class NamedPirate extends Model {}
      const modelClass = NamedPirate;
      include(modelClass, AttributeRegistration);
      encrypts.call(modelClass, "catchphrase");

      expect(filterParameters).toContain("named_pirate.catchphrase");
    } finally {
      listeners.pop();
    }
  });

  it("installing autofiltered parameters will work with unnamed classes", () => {
    const filterParameters: string[] = [];
    const autoFilteredParameters = new AutoFilteredParameters({ config: { filterParameters } });
    autoFilteredParameters.enable();

    const listeners = Encryption.onEncryptedAttributeDeclared((klass, name) => {
      autoFilteredParameters.attributeWasDeclared(klass, name);
    });

    try {
      const modelClass = (() => class extends Model {})();
      include(modelClass, AttributeRegistration);
      encrypts.call(modelClass, "catchphrase");

      expect(filterParameters).toContain("catchphrase");
    } finally {
      listeners.pop();
    }
  });

  it("exclude the installation of autofiltered params", () => {
    Encryption.config.excludedFromFilterParameters = ["catchphrase"];

    const filterParameters: string[] = [];
    const autoFilteredParameters = new AutoFilteredParameters({ config: { filterParameters } });
    autoFilteredParameters.enable();

    const listeners = Encryption.onEncryptedAttributeDeclared((klass, name) => {
      autoFilteredParameters.attributeWasDeclared(klass, name);
    });

    try {
      const modelClass = class extends Model {};
      include(modelClass, AttributeRegistration);
      encrypts.call(modelClass, "catchphrase");

      expect(filterParameters).toEqual([]);
    } finally {
      listeners.pop();
      Encryption.config.excludedFromFilterParameters = [];
    }
  });
});
