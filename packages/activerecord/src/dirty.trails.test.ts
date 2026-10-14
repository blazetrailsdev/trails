import { describe, it, expect, beforeAll } from "vitest";
import type { HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { fixtures } from "./test-helpers/use-fixtures.js";
import { Topic } from "./test-helpers/models/topic.js";
import { _touchRow as dirtyTouchRow } from "./attribute-methods/dirty.js";

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

  it("_touchRow clears its per-call state when the row write rejects", async () => {
    const topic = await Topic.createBang({ title: "t", content: { a: "a" } });
    const boom = new Error("row write failed");

    await expect(
      dirtyTouchRow.call(topic as never, ["updated_at"], null, () => Promise.reject(boom)),
    ).rejects.toBe(boom);

    const internals = topic as unknown as {
      _touchAttrNames: unknown;
      _skipDirtyTracking: unknown;
    };
    expect(internals._touchAttrNames).toBe(null);
    expect(internals._skipDirtyTracking).toBe(null);
  });

  it("previous changes includes in place serialized attribute mutation", async () => {
    const topic = await Topic.createBang({ content: { a: "a" } });

    expect(topic.previousChanges.has("content")).toBe(true);

    (topic.content as Record<string, string>)["b"] = "b";

    expect(topic.isChanged).toBeTruthy();

    await topic.saveBang();

    expect(topic.isChanged).toBeFalsy();
    expect(topic.previousChanges.has("content")).toBe(true);
    expect(topic.savedChanges.has("content")).toBe(true);
    expect(
      (topic.previousChanges.get("content")![0] as HashWithIndifferentAccess<string>).get("a"),
    ).toBe("a");
    expect(
      (topic.previousChanges.get("content")![0] as HashWithIndifferentAccess<string>).get("b"),
    ).toBeUndefined();
    expect(
      (topic.previousChanges.get("content")![1] as HashWithIndifferentAccess<string>).get("a"),
    ).toBe("a");
    expect(
      (topic.previousChanges.get("content")![1] as HashWithIndifferentAccess<string>).get("b"),
    ).toBe("b");
  });
});
