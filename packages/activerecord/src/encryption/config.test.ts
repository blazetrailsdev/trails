import { describe, it, expect } from "vitest";
import { Config } from "./config.js";
import { ConfigError } from "./errors.js";

describe("ActiveRecord::Encryption::ConfigTest", () => {
  it("required keys will raise a config error when accessed but not set", () => {
    const config = new Config();
    expect(() => config.get("primaryKey")).toThrow(ConfigError);
    expect(() => config.get("deterministicKey")).toThrow(ConfigError);
    expect(() => config.get("keyDerivationSalt")).toThrow(ConfigError);
  });
});
