import { describe, it, expect } from "vitest";
import "../index.js";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { Topic } from "../test-helpers/models/topic.js";

registerModel(Topic);

describe("string limit_value / offset_value read sites", () => {
  fixtures(["topics"]);

  it("second raises NoMethodError rather than yielding NaN", async () => {
    await expect(Topic.limit("asdfadf").second()).rejects.toThrow(/undefined method `-'/);
  });

  it("inspect raises ArgumentError rather than rendering an empty entry list", async () => {
    const rel = Topic.limit(2);
    await rel;
    (rel as unknown as { _values: Record<string, unknown> })._values.limit = "asdfadf";
    expect(() => rel.inspect()).toThrow(/comparison of String with 11 failed/);
  });

  it("prettyPrint raises ArgumentError rather than rendering an empty entry list", async () => {
    const rel = Topic.limit("asdfadf");
    await expect(
      rel.prettyPrint({ pp: async () => {} } as unknown as Parameters<typeof rel.prettyPrint>[0]),
    ).rejects.toThrow(/comparison of String with 11 failed/);
  });

  it("inBatches raises ArgumentError rather than comparing falsely", async () => {
    await expect(async () => {
      for await (const _batch of Topic.limit("asdfadf").inBatches()) {
      }
    }).rejects.toThrow(/invalid value for Integer\(\): "asdfadf"/);
  });
});
