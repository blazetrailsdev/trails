import { describe, it, expect } from "vitest";
import { Config } from "./config.js";
import { Configuration } from "./errors.js";

describe("ActiveRecord::Encryption::ConfigTest", () => {
  it("required keys will raise a config error when accessed but not set", () => {
    const config = new Config();
    config.primaryKey = undefined as never;
    expect(() => config.primaryKey).toThrow(Configuration);

    config.primaryKey = "some key";
    expect(() => config.primaryKey).not.toThrow();
  });
});
