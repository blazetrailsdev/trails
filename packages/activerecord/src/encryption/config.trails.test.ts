import { describe, it, expect } from "vitest";
import { Config, type Compressor } from "./config.js";
import { Scheme } from "./scheme.js";

const compressor: Compressor = {
  deflate: (data) => Buffer.from(data),
  inflate: (data) => Buffer.from(data).toString(),
};

describe("ActiveRecord::Encryption::ConfigTest", () => {
  it("credential predicates answer the stored value's presence", () => {
    const config = new Config();
    expect(config.hasPrimaryKey()).toBeUndefined();
    expect(config.hasDeterministicKey()).toBeUndefined();
    expect(config.hasKeyDerivationSalt()).toBeUndefined();

    config.primaryKey = "the primary key";
    config.deterministicKey = "the deterministic key";
    config.keyDerivationSalt = "the salt";

    expect(config.hasPrimaryKey()).toBe("the primary key");
    expect(config.hasDeterministicKey()).toBe("the deterministic key");
    expect(config.hasKeyDerivationSalt()).toBe("the salt");
  });

  it("previous= builds a Scheme for each set of properties, so its config is validated at configure time", () => {
    const config = new Config();
    config.previous = [{ deterministic: true }];

    expect(config.previousSchemes.length).toBe(1);
    expect(config.previousSchemes[0]).toBeInstanceOf(Scheme);
    expect(config.previousSchemes[0].deterministic).toBe(true);

    expect(() => {
      config.previous = [{ compressor, compress: false }];
    }).toThrow("compressor: can't be used with compress: false");
  });

  it("credential predicates treat a blank credential as absent", () => {
    const config = new Config();
    config.primaryKey = "";
    config.deterministicKey = "  ";
    config.keyDerivationSalt = "";

    expect(config.hasPrimaryKey()).toBeUndefined();
    expect(config.hasDeterministicKey()).toBeUndefined();
    expect(config.hasKeyDerivationSalt()).toBeUndefined();
  });
});
