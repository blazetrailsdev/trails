/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Dirty` in its class body, the way the Rails test
   model it mirrors does; the empty class/interface merge beside it is how `include()` surfaces
   those members on the type side. */
import { include } from "@blazetrails/activesupport";
import { Dirty } from "./dirty.js";
import { describe, it, expect } from "vitest";
import { Model } from "./index.js";

describe("DirtyGeneratedMethods", () => {
  class Person extends Model {
    static {
      include(this, Dirty);
      this.attribute("name", "string");
      this.attribute("age", "integer");
    }
  }
  interface Person extends Dirty {}

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
    expect((p as any).nameChange).toEqual(["Alice", "Bob"]);
  });

  it("<attr>Was returns the pre-change value", () => {
    const p = new Person({ name: "Alice" });
    p.changesApplied();
    (p as any).name = "Bob";
    expect((p as any).nameWas).toBe("Alice");
  });

  it("<attr>PreviouslyChanged and <attr>PreviousChange reflect the last save", () => {
    const p = new Person({ name: "Alice" });
    p.changesApplied();
    (p as any).name = "Bob";
    p.changesApplied();
    expect((p as any).namePreviouslyChanged()).toBe(true);
    expect((p as any).namePreviousChange).toEqual(["Alice", "Bob"]);
  });

  it("<attr>PreviouslyWas is the pre-save value from the last save", () => {
    const p = new Person({ name: "Alice" });
    p.changesApplied();
    (p as any).name = "Bob";
    p.changesApplied();
    expect((p as any).namePreviouslyWas).toBe("Alice");
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
