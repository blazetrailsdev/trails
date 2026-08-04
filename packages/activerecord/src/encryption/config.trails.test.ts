import { describe, it, expect } from "vitest";
import { Config } from "./config.js";

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
