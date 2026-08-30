import { describe, it, expect, beforeAll } from "vitest";
import { fixtures } from "./test-fixtures.js";
import { Topic } from "./test-helpers/models/topic.js";

describe("Dirty restore of an in-place mutation", () => {
  fixtures(["topics"]);

  beforeAll(async () => {
    await Topic.first();
  });

  it("restoreAttributes restores a serialized attribute mutated in place", async () => {
    const topic = await Topic.createBang({ content: { a: "a" } });

    (topic.content as Record<string, string>)["b"] = "b";

    expect(topic.isChanged).toBe(true);
    expect(topic.changed).toEqual(["content"]);

    (topic as unknown as { restoreAttributes(): void }).restoreAttributes();

    expect(topic.content).toEqual({ a: "a" });
    expect(topic.changed).toEqual([]);
    expect(topic.isChanged).toBe(false);
  });

  it("restoreAttributeBang restores a serialized attribute mutated in place", async () => {
    const topic = await Topic.createBang({ content: { a: "a" } });

    (topic.content as Record<string, string>)["b"] = "b";

    (topic as unknown as { restoreAttributeBang(name: string): void }).restoreAttributeBang(
      "content",
    );

    expect(topic.content).toEqual({ a: "a" });
    expect(topic.isChanged).toBe(false);
  });

  it("attributeChangedInPlace is true for a serialized attribute mutated in place", async () => {
    const topic = await Topic.createBang({ content: { a: "a" } });

    (topic.content as Record<string, string>)["b"] = "b";

    expect(topic.attributeChangedInPlace("content")).toBe(true);
  });
});
