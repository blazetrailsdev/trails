/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Dirty` in its class body, the way the Rails test
   model it mirrors does; the empty class/interface merge beside it is how `include()` surfaces
   those members on the type side. */
import { include } from "@blazetrails/activesupport";
import { Dirty } from "./dirty.js";
import { describe, it, expect } from "vitest";
import { Model } from "./index.js";

describe("DirtyMutations", () => {
  class Person extends Model {
    static {
      include(this, Dirty);
      this.attribute("name", "string");
      this.attribute("age", "integer");
    }
  }
  interface Person extends Dirty {}

  it("mutationsFromDatabase tracks pending writes vs the loaded values", () => {
    const p = new Person({ name: "Alice", age: 30 });
    p.changesApplied();
    expect(p.mutationsFromDatabase.changes()).toEqual({});
    (p as any).name = "Bob";
    expect(p.mutationsFromDatabase.changes()).toEqual({ name: ["Alice", "Bob"] });
  });

  it("mutationsFromDatabase clears after changesApplied", () => {
    const p = new Person({ name: "Alice" });
    p.changesApplied();
    (p as any).name = "Bob";
    p.changesApplied();
    expect(p.mutationsFromDatabase.changes()).toEqual({});
  });

  it("mutationsBeforeLastSave snapshots pending changes at save time", () => {
    const p = new Person({ name: "Alice" });
    p.changesApplied();
    expect(p.mutationsBeforeLastSave.changes()).toEqual({ name: [null, "Alice"] });
    (p as any).name = "Bob";
    p.changesApplied();
    expect(p.mutationsBeforeLastSave.changes()).toEqual({ name: ["Alice", "Bob"] });
  });

  it("mutationsBeforeLastSave is replaced on the next save", () => {
    const p = new Person({ name: "Alice" });
    p.changesApplied();
    (p as any).name = "Bob";
    p.changesApplied();
    (p as any).name = "Carol";
    p.changesApplied();
    expect(p.mutationsBeforeLastSave.changes()).toEqual({ name: ["Bob", "Carol"] });
  });

  it("forgetAttributeAssignments drops pending tracking without reverting values", () => {
    const p = new Person({ name: "Alice" });
    p.changesApplied();
    (p as any).name = "Bob";
    (p as any).age = 40;
    p.forgetAttributeAssignments();
    expect(p.mutationsFromDatabase.changes()).toEqual({});
    expect((p as any).name).toBe("Bob");
    expect((p as any).age).toBe(40);
  });

  it("forgetAttributeAssignments resets the baseline so later writes diff from current", () => {
    const p = new Person({ name: "Alice" });
    p.changesApplied();
    (p as any).name = "Bob";
    p.forgetAttributeAssignments();
    (p as any).name = "Carol";
    expect(p.mutationsFromDatabase.changes()).toEqual({ name: ["Bob", "Carol"] });
  });

  it("forgetAttributeAssignments preserves mutationsBeforeLastSave", () => {
    const p = new Person({ name: "Alice" });
    p.changesApplied();
    (p as any).name = "Bob";
    p.changesApplied();
    (p as any).name = "Carol";
    p.forgetAttributeAssignments();
    expect(p.mutationsBeforeLastSave.changes()).toEqual({ name: ["Alice", "Bob"] });
  });

  it("clearAttributeChange drops a single attribute's pending change", () => {
    const p = new Person({ name: "Alice", age: 30 });
    p.changesApplied();
    (p as any).name = "Bob";
    (p as any).age = 40;
    p.clearAttributeChange("name");
    expect(p.mutationsFromDatabase.changes()).toEqual({ age: [30, 40] });
    expect((p as any).name).toBe("Bob");
  });

  it("clearAttributeChange rebinds the baseline for the cleared attribute", () => {
    const p = new Person({ name: "Alice" });
    p.changesApplied();
    (p as any).name = "Bob";
    p.clearAttributeChange("name");
    (p as any).name = "Carol";
    expect(p.mutationsFromDatabase.changes()).toEqual({ name: ["Bob", "Carol"] });
  });
});
