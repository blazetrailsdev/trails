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

    // MRI: dup.changes == {"title"=>[nil, "A"], "body"=>[nil, "new"]} — the copy
    // derives its dirtiness from its own rebuilt attributes, and the source
    // keeps its own construction-time change.
    expect(duped.changes).toEqual({ title: [null, "A"], body: [null, "new"] });
    expect(t.changes).toEqual({ title: [null, "A"] });
    expect(t.isChanged).toBe(true);
    expect(t.body).toBeNull();
  });

  it("writing to the source does not dirty the dup", () => {
    const t = new Topic({ title: "A" });
    const duped = t.dup();

    t.body = "new";

    expect(t.changes).toEqual({ title: [null, "A"], body: [null, "new"] });
    // MRI: dup.changes == {"title"=>[nil, "A"]}, and the source's later write
    // does not reach it.
    expect(duped.changes).toEqual({ title: [null, "A"] });
    expect(duped.body).toBeNull();
  });

  it("dup of a frozen model is writable", () => {
    const t = new Topic({ title: "A" });
    t.freeze();

    const duped = t.dup();

    // MRI: `T.new(title: "A").freeze.dup` is unfrozen, reads back "A", and
    // takes a write — `Object#dup` never carries the frozen state, and the
    // initialize_dup chain rewrites @attributes/@errors/the tracker on it.
    expect(Object.isFrozen(duped)).toBe(false);
    expect(duped.title).toBe("A");
    duped.title = "B";
    expect(duped.title).toBe("B");
    expect(duped.isChanged).toBe(true);
  });
});
