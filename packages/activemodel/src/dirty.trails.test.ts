import { describe, it, expect } from "vitest";
import { Model } from "./index.js";

/**
 * `dirty_test.rb` has no `dup` coverage, so these pin trails-only behaviour that
 * has no Rails test to mirror. The expectations are transcribed from MRI run
 * against `vendor/rails/activemodel` with `ActiveModel::Model` + `Attributes` +
 * `Dirty`, since `Dirty#initialize_dup` (dirty.rb:248-251) is what they exercise.
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
    expect(duped.changed).toBe(true);
    expect(duped.attributeWas("title")).toEqual("A");
  });

  it("dup carries the source's previous changes", () => {
    const t = new Topic({ title: "A" });
    t.changesApplied();
    t.title = "B";

    // MRI: dup.previous_changes == t.previous_changes
    expect(t.dup().previousChanges).toEqual(t.previousChanges);
  });

  it("writing to the dup does not dirty the source", () => {
    const t = new Topic({ title: "A" });
    const duped = t.dup();

    duped.body = "new";

    // MRI: mutating the dup leaves t.changes untouched.
    expect(duped.changes).toEqual({ body: [null, "new"] });
    expect(t.changes).toEqual({});
    expect(t.changed).toBe(false);
    expect(t.body).toBeNull();
  });

  it("writing to the source does not dirty the dup", () => {
    const t = new Topic({ title: "A" });
    const duped = t.dup();

    t.body = "new";

    expect(t.changes).toEqual({ body: [null, "new"] });
    expect(duped.changes).toEqual({});
    expect(duped.changed).toBe(false);
  });

  it("dup gives the copy its own tracker", () => {
    const t = new Topic({ title: "A" });
    const duped = t.dup();

    expect(duped._dirty).not.toBe(t._dirty);
  });

  it("dup gives the copy its own errors", async () => {
    Topic.validates("title", { presence: true });
    try {
      const t = new Topic({ title: "A" });
      await t.isValid();

      const duped = t.dup();
      duped.title = null;
      await duped.isInvalid();

      expect(duped.errors.get("title")).toEqual(["can't be blank"]);
      expect(t.errors.get("title")).toEqual([]);
      expect(duped.errors).not.toBe(t.errors);
    } finally {
      Topic.clearValidatorsBang();
    }
  });
});
