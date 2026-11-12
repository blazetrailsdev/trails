import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Encryption } from "../../../lib/encryption.js";
import { DerivedSecretKeyProvider } from "../../../lib/encryption/derived-secret-key-provider.js";
import { Book } from "../../models/book.js";
import { Pirate } from "../../models/pirate.js";
import { fixtures } from "../../support/use-fixtures.js";
import {
  AutoFilteredParameters,
  type AutoFilteredParametersApp,
} from "../../../lib/encryption/auto-filtered-parameters.js";
import type { SchemeOptions } from "../../../lib/encryption/scheme.js";

describe("ActiveRecord::Encryption::ConfigurableTest", () => {
  fixtures({});
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
      const modelClass = class extends Book {};
      modelClass.encrypts("isbn");

      expect(capturedKlass).toBe(modelClass);
      expect(capturedName).toBe("isbn");
    } finally {
      listeners.pop();
    }
  });

  it("installing autofiltered parameters will add the encrypted attribute as a filter parameter using the dot notation", () => {
    const application = { config: { filterParameters: [] as Array<string | RegExp> } };

    withAutoFilteredParameters(application, () => {
      class NamedPirate extends Pirate {
        static {
          this.tableName = "pirates";
        }
      }
      NamedPirate.encrypts("catchphrase");
    });

    expect(application.config.filterParameters).toContain("named_pirate.catchphrase");
  });

  it("installing autofiltered parameters will work with unnamed classes", () => {
    const application = { config: { filterParameters: [] as Array<string | RegExp> } };

    withAutoFilteredParameters(application, () => {
      void (() =>
        class extends Pirate {
          static {
            this.tableName = "pirates";
            this.encrypts("catchphrase");
          }
        })();
    });

    expect(application.config.filterParameters).toContain("catchphrase");
  });

  it("exclude the installation of autofiltered params", () => {
    Encryption.config.excludedFromFilterParameters = ["catchphrase"];

    const application = { config: { filterParameters: [] as Array<string | RegExp> } };

    withAutoFilteredParameters(application, () => {
      void class extends Pirate {
        static {
          this.tableName = "pirates";
          this.encrypts("catchphrase");
        }
      };
    });

    expect(application.config.filterParameters).toEqual([]);

    Encryption.config.excludedFromFilterParameters = [];
  });

  function withAutoFilteredParameters(
    application: AutoFilteredParametersApp,
    block: () => void,
  ): void {
    const autoFilteredParameters = new AutoFilteredParameters(application);
    block();
    autoFilteredParameters.enable();
  }
});
