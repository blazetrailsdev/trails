import { describe, it, expect } from "vitest";
import "../index.js";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { Topic } from "../test-helpers/models/topic.js";

registerModel(Topic);

describe("find with a block is Enumerable#find over the relation's records", () => {
  const topics = fixtures(["topics"]).topics;

  it("answers the first record the block accepts", async () => {
    const second = topics("second");
    const found = await Topic.order("id").find((topic: Topic) => topic.id === second.id);
    expect(found?.id).toBe(second.id);
    expect(found).toBeInstanceOf(Topic);
  });

  it("stops at the first match", async () => {
    const seen: unknown[] = [];
    await Topic.order("id").find((topic: Topic) => {
      seen.push(topic.id);
      return true;
    });
    expect(seen).toHaveLength(1);
  });

  it("answers nil with no match, and calls if_none when one is given", async () => {
    expect(await Topic.all().find(() => false)).toBeNull();
    const ifNone = (): string => "none";
    expect(await (Topic.all().find as (...args: unknown[]) => unknown)(ifNone, () => false)).toBe(
      "none",
    );
  });

  it("runs on a loaded relation without another query", async () => {
    const relation = await Topic.order("id").load();
    const first = topics("first");
    expect((await relation.find((topic: Topic) => topic.id === first.id))?.id).toBe(first.id);
  });
});
