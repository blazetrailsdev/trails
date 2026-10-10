import { describe, it, expect } from "vitest";
import "../index.js";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { Topic } from "../test-helpers/models/topic.js";

registerModel(Topic);

describe("string limit_value / offset_value read sites", () => {
  fixtures(["topics"]);

  it("second raises NoMethodError rather than yielding NaN", async () => {
    await expect(Topic.limit("asdfadf").second()).rejects.toThrow(/undefined method '-'/);
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

  it("find with several ids and an order raises Integer#>'s ArgumentError for a String limit", async () => {
    await expect(Topic.order("id").limit("3").find(1, 2)).rejects.toThrow(
      /comparison of Integer with String failed/,
    );
  });

  it("find with several ids and an order raises Integer#-'s TypeError for a String offset", async () => {
    const rel = Topic.order("id");
    (rel as unknown as { _values: Record<string, unknown> })._values.offset = "1";
    await expect(rel.find(1, 2)).rejects.toThrow(/String can't be coerced into Integer/);
  });

  it("find with several ids and no order raises Array#slice's TypeError for a String limit", async () => {
    await expect(Topic.limit("asdfadf").find(1, 2)).rejects.toThrow(
      /no implicit conversion of String into Integer/,
    );
  });

  it("find with several ids and no order raises Array#slice's TypeError naming the operand's class", async () => {
    const rel = Topic.all();
    (rel as unknown as { _values: Record<string, unknown> })._values.limit = true;
    await expect(rel.find(1, 2)).rejects.toThrow(/no implicit conversion of true into Integer/);
  });

  it("find with several ids and no order answers the ids past the offset and within the limit", async () => {
    const found = await Topic.limit(1).offset(1).find(1, 2);
    expect((found as Topic[]).map((topic) => topic.id)).toEqual([2]);
  });

  it("inBatches raises ArgumentError rather than comparing falsely", async () => {
    await expect(async () => {
      for await (const _batch of Topic.limit("asdfadf").inBatches()) {
      }
    }).rejects.toThrow(/invalid value for Integer\(\): "asdfadf"/);
  });
});
