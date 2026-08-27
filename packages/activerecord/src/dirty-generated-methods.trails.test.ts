import { describe, it, expect } from "vitest";
import { Base } from "./base.js";

/**
 * Covers the ActiveRecord half of the per-attribute dirty cascade —
 * `attribute_method_affix(prefix: "saved_change_to_", …)` and friends
 * (activerecord/lib/active_record/attribute_methods/dirty.rb:53-59). The
 * ActiveModel half is covered by
 * activemodel/src/dirty-generated-methods.test.ts.
 *
 * No Rails counterpart: Rails exercises these names through DirtyTest against
 * real models; this pins that the pattern declarations generate them at all.
 */
interface Generated {
  name: string | null;
  changesApplied(): void;
  readonly nameInDatabase: unknown;
  readonly nameBeforeLastSave: unknown;
  isSavedChangeToName(): boolean;
  readonly savedChangeToName: [unknown, unknown] | null;
  isWillSaveChangeToName(): boolean;
}

describe("DirtyGeneratedMethods", () => {
  class Person extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("age", "integer");
    }
  }

  it("<attr>InDatabase returns the persisted value", () => {
    const p = Person.new({ name: "Alice" }) as unknown as Generated;
    p.changesApplied();
    p.name = "Bob";
    expect(p.nameInDatabase).toBe("Alice");
  });

  it("<attr>BeforeLastSave surfaces the prior persisted value", () => {
    const p = Person.new({ name: "Alice" }) as unknown as Generated;
    p.changesApplied();
    p.name = "Bob";
    p.changesApplied();
    expect(p.nameBeforeLastSave).toBe("Alice");
  });

  it("savedChangeTo<Attr> and willSaveChangeTo<Attr> follow save lifecycle", () => {
    const p = Person.new({}) as unknown as Generated;
    p.changesApplied();
    p.name = "Bob";
    expect(p.isWillSaveChangeToName()).toBe(true);
    expect(p.isSavedChangeToName()).toBe(false);
    p.changesApplied();
    expect(p.isWillSaveChangeToName()).toBe(false);
    expect(p.isSavedChangeToName()).toBe(true);
  });

  it("savedChangeTo<Attr> returns the last save's [old, new] pair", () => {
    const p = Person.new({ name: "Alice" }) as unknown as Generated;
    p.changesApplied();
    expect(p.savedChangeToName).toEqual([null, "Alice"]);
    p.name = "Bob";
    p.changesApplied();
    expect(p.savedChangeToName).toEqual(["Alice", "Bob"]);
  });
});

/**
 * The `saved_change_to_*` / `*_before_last_save` / `*_in_database` /
 * `will_save_change_to_*` generics are ActiveRecord's, not ActiveModel's —
 * `activerecord/lib/active_record/attribute_methods/dirty.rb:86-193` defines
 * them and `activemodel/lib/active_model/dirty.rb` does not. These cases moved
 * here from activemodel/src/dirty.test.ts with the methods.
 */
describe("willSaveChangeToAttribute", () => {
  it("returns true when attribute has been changed", () => {
    class Widget extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("size", "integer");
      }
    }

    const w = new Widget({ name: "Test", size: 5 });
    w.changesApplied();
    w.writeAttribute("name", "Changed");
    expect(w.isWillSaveChangeToAttribute("name")).toBe(true);
    expect(w.isWillSaveChangeToAttribute("size")).toBe(false);
  });

  it("attributeChangeToBeSaved returns [old, new]", () => {
    class Widget extends Base {
      static {
        this.attribute("name", "string");
      }
    }

    const w = new Widget({ name: "Test" });
    w.changesApplied();
    w.writeAttribute("name", "Changed");
    expect(w.attributeChangeToBeSaved("name")).toEqual(["Test", "Changed"]);
  });

  it("willSaveChangeToAttribute supports from/to", () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    const u = new User({ name: "Alice" });
    u.changesApplied();
    u.writeAttribute("name", "Bob");
    expect(u.isWillSaveChangeToAttribute("name", { from: "Alice", to: "Bob" })).toBe(true);
    expect(u.isWillSaveChangeToAttribute("name", { from: "Wrong" })).toBe(false);
  });
});

describe("attributeInDatabase / attributeBeforeLastSave", () => {
  it("attributeInDatabase returns the pre-change value", () => {
    class Widget extends Base {
      static {
        this.attribute("name", "string");
      }
    }

    const w = new Widget({ name: "Test" });
    w.changesApplied();
    w.writeAttribute("name", "Changed");
    expect(w.attributeInDatabase("name")).toBe("Test");
  });

  it("attributeBeforeLastSave returns old value after save", () => {
    class Widget extends Base {
      static {
        this.attribute("name", "string");
      }
    }

    const w = new Widget({ name: "Original" });
    w.changesApplied();
    w.writeAttribute("name", "Updated");
    w.changesApplied();
    expect(w.attributeBeforeLastSave("name")).toBe("Original");
  });

  it("savedChangeToAttribute supports from/to", () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    const u = new User({ name: "Alice" });
    u.changesApplied();
    u.writeAttribute("name", "Bob");
    u.changesApplied();
    expect(u.isSavedChangeToAttribute("name", { from: "Alice", to: "Bob" })).toBe(true);
    expect(u.isSavedChangeToAttribute("name", { from: "Alice", to: "Wrong" })).toBe(false);
    expect(u.isSavedChangeToAttribute("name", { from: "Wrong", to: "Bob" })).toBe(false);
  });
});

describe("enum from/to through the generated predicates", () => {
  class Card extends Base {
    static {
      this.attribute("status", "integer");
      this.enum("status", { proposed: 0, written: 1 });
    }
  }

  interface GeneratedEnum {
    status: string | null;
    changesApplied(): void;
    statusChanged(options?: { from?: unknown; to?: unknown }): boolean;
    isSavedChangeToStatus(options?: { from?: unknown; to?: unknown }): boolean;
    isWillSaveChangeToStatus(options?: { from?: unknown; to?: unknown }): boolean;
  }

  // The generated predicates reach `AttributeMutationTracker#changed?` without
  // passing through any `Base` body, so they are the path that proves the
  // `from:`/`to:` cast lives in the tracker (attribute_mutation_tracker.rb:
  // 41-51) rather than at a call site.
  it("attributeChanged casts a stored value through the attribute's EnumType", () => {
    const card = new Card({ status: "proposed" }) as unknown as GeneratedEnum;
    card.changesApplied();
    card.status = "written";
    expect(card.statusChanged({ from: "proposed", to: "written" })).toBe(true);
    expect(card.statusChanged({ from: 0, to: 1 })).toBe(true);
    expect(card.statusChanged({ to: "proposed" })).toBe(false);
  });

  it("willSaveChangeTo and savedChangeTo cast the same way", () => {
    const card = new Card({ status: "proposed" }) as unknown as GeneratedEnum;
    card.changesApplied();
    card.status = "written";
    expect(card.isWillSaveChangeToStatus({ from: 0, to: 1 })).toBe(true);
    card.changesApplied();
    expect(card.isSavedChangeToStatus({ from: 0, to: 1 })).toBe(true);
    expect(card.isSavedChangeToStatus({ from: 1 })).toBe(false);
  });
});
