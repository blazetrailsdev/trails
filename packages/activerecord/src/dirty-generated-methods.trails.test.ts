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
