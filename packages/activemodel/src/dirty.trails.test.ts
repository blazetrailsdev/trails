import { describe, it, expect } from "vitest";
import { Model } from "./index.js";

/**
 * `dirty_test.rb` has no `dup` coverage, so these pin trails-only behaviour with
 * no Rails test to mirror. The expectations are transcribed from MRI run against
 * `vendor/rails/activemodel` with `ActiveModel::Model` + `Attributes` + `Dirty`,
 * since `Dirty#initialize_dup` (dirty.rb:248-251) is what they exercise.
 */
describe("Dirty across dup", () => {
  class Topic extends Model {
    static {
      this.attribute("title", "string");
      this.attribute("body", "string");
    }

    declare title: string | null;
    declare body: string | null;
  }

  it("dup carries the source's pending changes", () => {
    const t = new Topic({ title: "A" });
    t.changesApplied();
    t.title = "B";

    const duped = t.dup();

    // MRI: t.changes == dup.changes == {"title"=>["A", "B"]}
    expect(duped.changes).toEqual(t.changes);
    expect(duped.changes).toEqual({ title: ["A", "B"] });
    expect(duped.isChanged).toBe(true);
    expect(duped.attributeWas("title")).toEqual("A");
    // MRI: dup.previous_changes == t.previous_changes
    expect(duped.previousChanges).toEqual(t.previousChanges);
  });

  it("writing to the dup does not dirty the source", () => {
    const t = new Topic({ title: "A" });
    const duped = t.dup();

    duped.body = "new";

    expect(duped.changes).toEqual({ body: [null, "new"] });
    expect(t.changes).toEqual({});
    expect(t.isChanged).toBe(false);
    expect(t.body).toBeNull();
  });

  it("writing to the source does not dirty the dup", () => {
    const t = new Topic({ title: "A" });
    const duped = t.dup();

    t.body = "new";

    expect(t.changes).toEqual({ body: [null, "new"] });
    expect(duped.changes).toEqual({});
    expect(duped.isChanged).toBe(false);
  });
});
