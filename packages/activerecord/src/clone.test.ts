import { describe, it, expect } from "vitest";
import { fixtures } from "./test-fixtures.js";
import { Topic } from "./test-helpers/models/topic.js";

describe("CloneTest", () => {
  fixtures(["topics"]);

  it("persisted", async () => {
    const topic = await Topic.first();
    const cloned = topic!.clone();
    expect(topic!.isPersisted()).toBeTruthy();
    expect(cloned.isPersisted()).toBeTruthy();
    expect(cloned.isNewRecord()).toBeFalsy();
    expect(cloned.isPreviouslyNewRecord()).toBeFalsy();
    expect(cloned.isPreviouslyPersisted()).toBeFalsy();
  });

  it("stays frozen", async () => {
    const topic = await Topic.first();
    topic!.freeze();

    const cloned = topic!.clone();
    expect(cloned.isPersisted()).toBeTruthy();
    expect(cloned.isNewRecord()).toBeFalsy();
    expect(cloned.isFrozen()).toBeTruthy();
    expect(() => {
      cloned.author_name = "Aaron";
    }).toThrow(/frozen/i);
  });

  it("shallow", async () => {
    const topic = await Topic.first();
    const cloned = topic!.clone();
    topic!.author_name = "Aaron";
    expect(cloned.author_name).toBe("Aaron");
  });

  it("freezing a cloned model does not freeze clone", async () => {
    const cloned = new Topic({});
    const clone = cloned.clone();
    cloned.freeze();
    expect(clone.isFrozen()).toBeFalsy();
    expect(() => {
      cloned.author_name = "Aaron";
    }).toThrow(/frozen/i);
  });
});
