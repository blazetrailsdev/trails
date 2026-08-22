/**
 * `dirty_test.rb` covers `restore_attribute!` only for an assigned attribute
 * (`:153-161`), so this pins the in-place arm, which has no Rails test to
 * mirror. Rails' `restore_attribute!` (activemodel/lib/active_model/dirty.rb:
 * 414-420) guards on `attribute_changed?` — true for an attribute mutated in
 * place as well as one assigned — and writes back `attribute_was`, so a mutated
 * serialized Hash IS restored.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { rebuildCanonicalTables } from "./support/canonical-table-rebuild.js";
import { Topic } from "./test-helpers/models/topic.js";

type Rec = Base & Record<string, unknown>;

describe("Dirty restore of an in-place mutation", () => {
  fixtures([]);

  beforeAll(async () => {
    await rebuildCanonicalTables(Base.connection, ["topics"]);
    await Topic.first();
  });

  it("restoreAttributes restores a serialized attribute mutated in place", async () => {
    const topic = (await Topic.createBang({ content: { a: "a" } })) as Rec;

    (topic.content as Record<string, string>)["b"] = "b";

    expect(topic.isChanged).toBe(true);
    expect(topic.changed).toEqual(["content"]);

    (topic as unknown as { restoreAttributes(): void }).restoreAttributes();

    expect(topic.content).toEqual({ a: "a" });
    expect(topic.changed).toEqual([]);
    expect(topic.isChanged).toBe(false);
  });

  it("restoreAttribute restores a serialized attribute mutated in place", async () => {
    const topic = (await Topic.createBang({ content: { a: "a" } })) as Rec;

    (topic.content as Record<string, string>)["b"] = "b";

    (topic as unknown as { restoreAttribute(name: string): void }).restoreAttribute("content");

    expect(topic.content).toEqual({ a: "a" });
    expect(topic.isChanged).toBe(false);
  });
});
