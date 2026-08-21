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
  savedChangeToName(): boolean;
  willSaveChangeToName(): boolean;
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
    expect(p.willSaveChangeToName()).toBe(true);
    expect(p.savedChangeToName()).toBe(false);
    p.changesApplied();
    expect(p.willSaveChangeToName()).toBe(false);
    expect(p.savedChangeToName()).toBe(true);
  });
});

/**
 * The `saved_change_to_*` / `*_before_last_save` / `*_in_database` /
 * `will_save_change_to_*` generics are ActiveRecord's, not ActiveModel's —
 * `activerecord/lib/active_record/attribute_methods/dirty.rb:150-240` defines
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
    expect(w.willSaveChangeToAttribute("name")).toBe(true);
    expect(w.willSaveChangeToAttribute("size")).toBe(false);
  });

  it("willSaveChangeToAttributeValues returns [old, new]", () => {
    class Widget extends Base {
      static {
        this.attribute("name", "string");
      }
    }

    const w = new Widget({ name: "Test" });
    w.changesApplied();
    w.writeAttribute("name", "Changed");
    expect(w.willSaveChangeToAttributeValues("name")).toEqual(["Test", "Changed"]);
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
    expect(u.willSaveChangeToAttribute("name", { from: "Alice", to: "Bob" })).toBe(true);
    expect(u.willSaveChangeToAttribute("name", { from: "Wrong" })).toBe(false);
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
    expect(u.savedChangeToAttribute("name", { from: "Alice", to: "Bob" })).toBe(true);
    expect(u.savedChangeToAttribute("name", { from: "Alice", to: "Wrong" })).toBe(false);
    expect(u.savedChangeToAttribute("name", { from: "Wrong", to: "Bob" })).toBe(false);
  });
});
