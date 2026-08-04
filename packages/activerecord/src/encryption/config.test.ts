import { describe, it, expect } from "vitest";
import { Config } from "./config.js";
import { Configuration } from "./errors.js";

describe("ActiveRecord::Encryption::ConfigTest", () => {
  it("required keys will raise a config error when accessed but not set", () => {
    const config = new Config();
    expect(() => config.primaryKey).toThrow(Configuration);
    expect(() => config.deterministicKey).toThrow(Configuration);
    expect(() => config.keyDerivationSalt).toThrow(Configuration);

    expect(() => config.primaryKey).toThrow(
      "Missing Active Record encryption credential: active_record_encryption.primary_key",
    );
  });
});
