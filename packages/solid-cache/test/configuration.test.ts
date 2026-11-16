import { describe, expect, it } from "vitest";
import { assertRaises } from "@blazetrails/activesupport/testing/assertions";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { Configuration } from "../lib/configuration.js";

describe("SolidCache::ConfigurationTest", () => {
  it("databases option accepts a single database name as a string", () => {
    const config = new Configuration({ databases: "cache" });
    expect(config.connectsTo).toEqual({ shards: { cache: { writing: "cache" } } });
  });

  it("databases option accepts a single database name as a symbol", () => {
    const config = new Configuration({ databases: "cache" });
    expect(config.connectsTo).toEqual({ shards: { cache: { writing: "cache" } } });
  });

  it("databases option accepts an array of database names", () => {
    const config = new Configuration({ databases: ["cache1", "cache2"] });
    expect(config.connectsTo).toEqual({
      shards: {
        cache1: { writing: "cache1" },
        cache2: { writing: "cache2" },
      },
    });
  });

  it("database option accepts a single database name", () => {
    const config = new Configuration({ database: "cache" });
    expect(config.connectsTo).toEqual({ shards: { cache: { writing: "cache" } } });
  });

  it("raises ArgumentError when multiple connection options are provided", async () => {
    const error = await assertRaises([ArgumentError], {}, () => {
      new Configuration({ database: "cache", databases: ["cache1"] });
    });
    expect(error.message).toBe(
      "You can only specify one of :database, :databases, or :connects_to",
    );
  });
});
