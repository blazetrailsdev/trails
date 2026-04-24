import { describe, it, expect } from "vitest";
import { Model } from "./index.js";

/**
 * Covers the per-attribute dirty method cascade generated when a typed
 * attribute is declared. Mirrors the ActiveModel::Dirty-generated
 * methods in activemodel/lib/active_model/dirty.rb:
 *   name_changed?, name_change, name_was, name_in_database,
 *   name_before_last_save, name_previously_changed?, name_previous_change,
 *   name_previously_was, saved_change_to_name, will_save_change_to_name,
 *   restore_name!
 */
describe("DirtyGeneratedMethods", () => {
  class Person extends Model {
    static {
      this.attribute("name", "string");
      this.attribute("age", "integer");
    }
  }

  it("<attr>Changed returns true after assignment", () => {
    const p = new Person({ name: "Alice" });
    p.changesApplied();
    expect((p as any).nameChanged()).toBe(false);
    (p as any).name = "Bob";
    expect((p as any).nameChanged()).toBe(true);
    expect((p as any).ageChanged()).toBe(false);
  });

  it("<attr>Change returns [old, new]", () => {
    const p = new Person({ name: "Alice" });
    p.changesApplied();
    (p as any).name = "Bob";
    expect((p as any).nameChange()).toEqual(["Alice", "Bob"]);
  });

  it("<attr>Was returns the pre-change value", () => {
    const p = new Person({ name: "Alice" });
    p.changesApplied();
    (p as any).name = "Bob";
    expect((p as any).nameWas()).toBe("Alice");
  });

  it("<attr>InDatabase returns the persisted value", () => {
    const p = new Person({ name: "Alice" });
    p.changesApplied();
    (p as any).name = "Bob";
    expect((p as any).nameInDatabase()).toBe("Alice");
  });

  it("<attr>BeforeLastSave surfaces the prior persisted value", () => {
    const p = new Person({ name: "Alice" });
    p.changesApplied();
    (p as any).name = "Bob";
    p.changesApplied();
    expect((p as any).nameBeforeLastSave()).toBe("Alice");
  });

  it("<attr>PreviouslyChanged and <attr>PreviousChange reflect the last save", () => {
    const p = new Person({ name: "Alice" });
    p.changesApplied();
    (p as any).name = "Bob";
    p.changesApplied();
    expect((p as any).namePreviouslyChanged()).toBe(true);
    expect((p as any).namePreviousChange()).toEqual(["Alice", "Bob"]);
  });

  it("<attr>PreviouslyWas is the pre-save value from the last save", () => {
    const p = new Person({ name: "Alice" });
    p.changesApplied();
    (p as any).name = "Bob";
    p.changesApplied();
    expect((p as any).namePreviouslyWas()).toBe("Alice");
  });

  it("savedChangeTo<Attr> and willSaveChangeTo<Attr> follow save lifecycle", () => {
    const p = new Person({ name: "Alice" });
    p.changesApplied();
    (p as any).name = "Bob";
    expect((p as any).willSaveChangeToName()).toBe(true);
    expect((p as any).savedChangeToName()).toBe(false);
    p.changesApplied();
    expect((p as any).willSaveChangeToName()).toBe(false);
    expect((p as any).savedChangeToName()).toBe(true);
  });

  it("restore<Attr> rolls back a single attribute only", () => {
    const p = new Person({ name: "Alice", age: 30 });
    p.changesApplied();
    (p as any).name = "Bob";
    (p as any).age = 40;
    (p as any).restoreName();
    expect((p as any).name).toBe("Alice");
    expect((p as any).nameChanged()).toBe(false);
    expect((p as any).age).toBe(40);
    expect((p as any).ageChanged()).toBe(true);
  });

  it("does not shadow user-defined methods of the same name", () => {
    class Account extends Model {
      static {
        this.attribute("balance", "integer");
      }
      balanceChanged(): string {
        return "user override";
      }
    }
    const a = new Account({ balance: 100 });
    expect((a as any).balanceChanged()).toBe("user override");
  });
});
