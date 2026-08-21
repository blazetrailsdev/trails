/**
 * Trails-specific invariants relocated out of attribute-methods.test.ts
 * (RFC 0043 extra-test burndown). These guard trails-internal mechanisms with
 * no Rails counterpart in attribute_methods_test.rb: the `formatForInspect`
 * helper, attribute-method generation (`defineAttributeMethods` cascade and
 * accessor-override preservation), `arelTable.get` alias passthrough,
 * `hasAttribute` alias resolution, and the readonly-attribute raise. Test names
 * are kept verbatim per CLAUDE.md.
 */
import { describe, it, expect, vi } from "vitest";
import { Base, DangerousAttributeError, ReadonlyAttributeError, registerModel } from "./index.js";
import { Model } from "@blazetrails/activemodel";
import { GeneratedAttributeMethods, isMethodDefinedWithin } from "./attribute-methods.js";
import { formatForInspect } from "./attribute-inspection.js";
import { registerSubclass } from "./inheritance.js";

import { fixtures } from "./test-fixtures.js";
import { Minivan } from "./test-helpers/models/minivan.js";

registerModel(Minivan);

/** Internal attribute-method generation surface exercised by these tests. */
interface Generatable {
  defineAttributeMethods(): boolean;
  _attributeMethodsGenerated?: boolean;
}
const generatable = (cls: unknown): Generatable => cls as Generatable;

describe("AttributeMethodsTest (trails)", () => {
  fixtures([]);

  it("initializeGeneratedModules replaces a module ActiveModel built first", async () => {
    class Legacy extends Base {
      static {
        this.attribute("title", "string");
        this.aliasAttribute("heading", "title");
      }
    }
    generatable(Legacy).defineAttributeMethods();

    expect(Legacy._generatedAttributeMethods).toBeInstanceOf(GeneratedAttributeMethods);
    expect(new Legacy({ title: "t" }).heading).toBe("t");
  });

  it("defineAttributeMethods cascades to the superclass", async () => {
    class Animal extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class Dog extends Animal {
      static {
        this.attribute("breed", "string");
      }
    }
    // Generating the subclass drives the parent's generation first, so the
    // parent's own flag is set even though it was never generated directly.
    generatable(Dog).defineAttributeMethods();
    expect(Object.prototype.hasOwnProperty.call(Animal, "_attributeMethodsGenerated")).toBe(true);
    expect(generatable(Animal)._attributeMethodsGenerated).toBe(true);
    expect(generatable(Dog)._attributeMethodsGenerated).toBe(true);
  });

  it("formatForInspect renders a valid Date as a quoted ISO string", () => {
    class M extends Base {}
    const out = formatForInspect.call(new M(), "x", new Date("2026-04-15T12:00:00.000Z"));
    expect(out).toBe('"2026-04-15T12:00:00.000Z"');
  });

  it("formatForInspect renders an invalid Date as quoted 'Invalid Date'", () => {
    class M extends Base {}
    const out = formatForInspect.call(new M(), "x", new Date(NaN));
    expect(out).toBe('"Invalid Date"');
  });

  it("formatForInspect does not crash for array containing an object with bigint values", () => {
    class M extends Base {}
    expect(() => formatForInspect.call(new M(), "x", [{ a: 1n }])).not.toThrow();
    expect(formatForInspect.call(new M(), "x", [{ a: 1n }])).toBe('[{"a":"1"}]');
  });

  it("returns true for alias_attribute names on instances", () => {
    // Rails `has_attribute?` resolves attribute_aliases
    // (active_record/attribute_methods.rb).
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.aliasAttribute("heading", "title");
      }
    }
    const t = new Topic({ title: "Hi" });
    expect(t.hasAttribute("heading")).toBe(true);
    expect(t.hasAttribute("title")).toBe(true);
    expect(t.hasAttribute("missing")).toBe(false);
  });

  it("returns true for alias_attribute names on the class", () => {
    // The class-level twin of the test above — Rails resolves
    // `attribute_aliases` against `attribute_types`
    // (active_record/attribute_methods.rb:254-258).
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.aliasAttribute("heading", "title");
      }
    }
    expect(Topic.hasAttribute("heading")).toBe(true);
    expect(Topic.hasAttribute("title")).toBe(true);
    expect(Topic.hasAttribute("missing")).toBe(false);
  });

  it("readonly attributes are not updated after create", async () => {
    // Rails raises ReadonlyAttributeError on a persisted-record write to an
    // attr_readonly column (readonly_attributes.rb line 49). The test name's
    // "are not updated" wording pre-dates Rails adding the raise; the
    // attribute isn't updated because the write itself is rejected. Minivan
    // (models/minivan.rb) declares `attr_readonly :color`.
    const minivan = await Minivan.create({ minivan_id: "mv1", color: "blue", name: "Rebel" });
    expect(() => {
      minivan.color = "red";
    }).toThrow(ReadonlyAttributeError);
    minivan.name = "Updated";
    await minivan.save();
    const found = await Minivan.find("mv1");
    expect(found.color).toBe("blue");
    expect(found.name).toBe("Updated");
  });

  it("arelTable.get passthrough for unaliased attribute", () => {
    class User extends Base {
      static {
        this.attribute("username", "string");
        this.aliasAttribute("login", "username");
      }
    }
    const attr = User.arelTable.get("username");
    expect(attr.name).toBe("username");
  });

  // Rails: a model that overrides only the writer still gets the generated reader
  // (activerecord/test/models/bulb.rb:27-29 — color= override, no explicit reader).
  it("setter-only override does not suppress generated reader", () => {
    class Widget extends Base {
      static {
        this.attribute("color", "string");
      }
      set color(v: string) {
        this.writeAttribute("color", v.toUpperCase());
      }
    }
    generatable(Widget).defineAttributeMethods();
    const desc = Object.getOwnPropertyDescriptor(Widget.prototype, "color");
    expect(desc?.get).toBeDefined();
    expect(desc?.set).toBeDefined();
  });

  it("getter-only override does not suppress generated setter", () => {
    class Widget extends Base {
      static {
        this.attribute("color", "string");
      }
      get color(): unknown {
        return (this.readAttribute("color") as string | null)?.toLowerCase() ?? null;
      }
    }
    generatable(Widget).defineAttributeMethods();
    const desc = Object.getOwnPropertyDescriptor(Widget.prototype, "color");
    expect(desc?.get).toBeDefined();
    expect(desc?.set).toBeDefined();
  });

  it("full accessor override is not clobbered by generation", () => {
    class Widget extends Base {
      static {
        this.attribute("color", "string");
      }
      get color(): unknown {
        return "fixed";
      }
      set color(_v: unknown) {}
    }
    generatable(Widget).defineAttributeMethods();
    const w = new Widget({});
    expect((w as { color: unknown }).color).toBe("fixed");
  });

  it("class attributeNames is memoized and frozen", async () => {
    class Topic extends Base {}
    await Topic.loadSchema();
    const first = Topic.attributeNames();
    expect(first).toContain("title");
    expect(Object.isFrozen(first)).toBe(true);
    expect(Topic.attributeNames()).toBe(first);
  });

  it("resetColumnInformation invalidates the class attributeNames memo", async () => {
    class Topic extends Base {}
    await Topic.loadSchema();
    const first = Topic.attributeNames();
    (Topic as unknown as { resetColumnInformation(): void }).resetColumnInformation();
    // The reset drops the shared cache's per-table entry; re-reflect so the
    // suite's warm-cache invariant is restored for later tests.
    await Topic.loadSchema();
    const second = Topic.attributeNames();
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it("tableName= invalidates the attributeNames memo on descendants", async () => {
    class Topic extends Base {}
    class ImportantTopic extends Topic {
      static {
        registerSubclass(this);
      }
    }
    await Topic.loadSchema();
    Topic.attributeNames();
    const subNames = ImportantTopic.attributeNames();
    Topic.tableName = "posts";
    expect(ImportantTopic.attributeNames()).not.toBe(subNames);
  });

  it("ignoredColumns= invalidates the attributeNames memo", async () => {
    class Topic extends Base {}
    await Topic.loadSchema();
    const first = Topic.attributeNames();
    Topic.ignoredColumns = ["approved"];
    expect(Topic.attributeNames()).not.toBe(first);
  });

  it("class columnNames is memoized and frozen", async () => {
    class Topic extends Base {}
    await Topic.loadSchema();
    const first = Topic.columnNames();
    expect(first).toContain("title");
    expect(Object.isFrozen(first)).toBe(true);
    expect(Topic.columnNames()).toBe(first);
  });

  it("ignoredColumns= invalidates the columnNames memo", async () => {
    class Topic extends Base {}
    await Topic.loadSchema();
    const first = Topic.columnNames();
    expect(first).toContain("approved");
    Topic.ignoredColumns = ["approved"];
    const second = Topic.columnNames();
    expect(second).not.toBe(first);
    expect(second).not.toContain("approved");
  });

  it("resetColumnInformation invalidates the class columnNames memo", async () => {
    class Topic extends Base {}
    await Topic.loadSchema();
    const first = Topic.columnNames();
    (Topic as unknown as { resetColumnInformation(): void }).resetColumnInformation();
    await Topic.loadSchema();
    const second = Topic.columnNames();
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it("subclass does not inherit the parent's attributeNames memo", async () => {
    class Topic extends Base {}
    await Topic.loadSchema();
    const parentNames = Topic.attributeNames();
    class ImportantTopic extends Topic {}
    expect(ImportantTopic.attributeNames()).not.toBe(parentNames);
  });

  it("does not memoize the cold-cache fail-open attributeNames answer", async () => {
    class NonExistentTable extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    // Cold cache fails open (documented inherent deviation — Rails' sync DB
    // hit would return []); loadSchema seeds dataSourceExists=false, and the
    // cold answer must not have been memoized, so the guard then closes.
    expect(NonExistentTable.attributeNames()).toEqual(["name"]);
    await NonExistentTable.loadSchema();
    expect(NonExistentTable.attributeNames()).toEqual([]);
  });

  it("aliasing an attribute onto an Active Record method raises DangerousAttributeError", () => {
    // define_attribute_method_pattern dispatches instance_method_already_implemented?
    // through the class, and ActiveRecord's override raises before the
    // `override: true` arm alias_attribute relies on is consulted
    // (activerecord/attribute_methods.rb:165-168, 324-331).
    class Employee extends Base {
      static {
        this.attribute("name", "string");
      }
    }

    expect(() => Employee.aliasAttribute("save", "name")).toThrow(DangerousAttributeError);
  });

  it("an ordinary class-body method is not overridden by a generated attribute method", () => {
    // attribute_methods.rb:326 — `instance_method_already_implemented?` is the
    // ONLY guard, and ActiveRecord's override answers it from the class's own
    // methods (activerecord/attribute_methods.rb:170-178), so a method written
    // in the class body survives attribute-method generation.
    class Employee extends Base {
      static {
        this.attribute("name", "string");
      }
      nameChanged(): boolean {
        return true;
      }
    }
    (Employee as unknown as { defineAttributeMethods(): boolean }).defineAttributeMethods();

    const employee = new Employee({ name: "David" });
    expect(employee.nameChanged()).toBe(true);
  });
  it("an inherited generated attribute method does not suppress the subclass's own generation", () => {
    // attribute_methods.rb:174-177 — the `superclass != Base` arm counts an
    // inherited method as already-implemented ONLY when its owner is not the
    // generated-attribute-methods module. `alias_attribute` generates into that
    // module (attribute_methods.rb:94), so the alias inherited from Middle is
    // regenerated on the subclass rather than treated as hand-written.
    class Middle extends Base {
      static {
        this.attribute("name", "string");
        this.aliasAttribute("nickname", "name");
      }
    }
    class Leaf extends Middle {}

    const host = Leaf as unknown as { isInstanceMethodAlreadyImplemented(n: string): boolean };
    expect("nickname" in (Leaf.prototype as object)).toBe(true);
    expect(host.isInstanceMethodAlreadyImplemented("nickname")).toBe(false);
  });

  it("an inherited generated dirty accessor does not suppress the subclass's own generation", () => {
    class Middle extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class Leaf extends Middle {}

    const host = Leaf as unknown as { isInstanceMethodAlreadyImplemented(n: string): boolean };
    expect("nameChanged" in (Leaf.prototype as object)).toBe(true);
    expect(host.isInstanceMethodAlreadyImplemented("nameChanged")).toBe(false);
  });

  it("undefineAttributeMethods clears the generated dirty accessors", () => {
    class Employee extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    expect(typeof (new Employee({}) as unknown as { nameChanged: unknown }).nameChanged).toBe(
      "function",
    );

    (Employee as unknown as { undefineAttributeMethods(): void }).undefineAttributeMethods();

    expect((new Employee({}) as unknown as { nameChanged: unknown }).nameChanged).toBeUndefined();
  });

  it("generates once when the schema load drives generation first", () => {
    class Widget extends Base {
      static override tableName = "posts";
    }
    const spy = vi.spyOn(
      Widget as unknown as { defineMethodAttribute(name: string): void },
      "defineMethodAttribute",
    );

    // Rails answers true from the first generating pass (attribute_methods.rb:104-125);
    // the nested post-load pass is still this call generating them.
    expect(generatable(Widget).defineAttributeMethods()).toBe(true);

    const names = spy.mock.calls.map(([name]) => name);
    expect(names.length).toBe(new Set(names).size);
    spy.mockRestore();
  });

  it("an inherited class-body method is already implemented for the subclass", () => {
    class HandWritten extends Base {
      static {
        this.attribute("name", "string");
      }
      nickname(): string {
        return "hand-written";
      }
    }
    class HandWrittenLeaf extends HandWritten {}

    const host = HandWrittenLeaf as unknown as {
      isInstanceMethodAlreadyImplemented(n: string): boolean;
    };
    expect(host.isInstanceMethodAlreadyImplemented("nickname")).toBe(true);
  });
});

describe("methodDefinedWithin (trails)", () => {
  class Super {
    greet(): string {
      return "super";
    }
  }
  class Redefines extends Super {
    override greet(): string {
      return "sub";
    }
  }
  class Inherits extends Super {}
  const within = (name: string, klass: unknown, superklass?: unknown) =>
    isMethodDefinedWithin.call({} as never, name, klass, superklass);

  it("is true when both classes define the name and the subclass redefines it", () => {
    expect(within("greet", Redefines, Super)).toBe(true);
  });

  it("is false when both classes define the name and the subclass inherits it", () => {
    expect(within("greet", Inherits, Super)).toBe(false);
  });

  it("is true when only the class defines the name", () => {
    expect(within("greet", Redefines, class {})).toBe(true);
  });

  it("is false when the class does not define the name", () => {
    expect(within("missing", Redefines, Super)).toBe(false);
  });

  it("defaults superklass to the class's superclass", () => {
    expect(within("greet", Redefines)).toBe(true);
    expect(within("greet", Inherits)).toBe(false);
  });
});

// `define_attribute_methods` gates its whole generation body behind
// `unless abstract_class?` (attribute_methods.rb:104-125), so an abstract class
// gets no per-attribute accessors — reader, writer, `*_before_type_cast` or
// `*_for_database` — while its concrete subclass gets all of them. The
// generated methods live on the class's own GeneratedAttributeMethods carrier
// spliced into its prototype chain, so `in` is what observes them; an
// own-property check sees neither.
describe("define_attribute_methods abstract gate (trails)", () => {
  fixtures({});

  it("an abstract class generates no per-attribute accessors and its concrete subclass does", () => {
    class AbstractTopic extends Base {
      static tableName = "topics";
      static {
        this.abstractClass = true;
      }
    }
    class ConcreteTopic extends AbstractTopic {}

    (AbstractTopic as unknown as { defineAttributeMethods(): boolean }).defineAttributeMethods();
    (ConcreteTopic as unknown as { defineAttributeMethods(): boolean }).defineAttributeMethods();

    expect("author_name" in AbstractTopic.prototype).toBe(false);
    expect("author_nameBeforeTypeCast" in AbstractTopic.prototype).toBe(false);
    expect("author_nameForDatabase" in AbstractTopic.prototype).toBe(false);

    expect("author_name" in ConcreteTopic.prototype).toBe(true);
    expect("author_nameBeforeTypeCast" in ConcreteTopic.prototype).toBe(true);
    expect("author_nameForDatabase" in ConcreteTopic.prototype).toBe(true);
  });
});

describe("ActiveRecord attribute read/write surface lives on Base, not Model", () => {
  it("defines the ActiveRecord-only members on Base.prototype", () => {
    for (const name of [
      "readAttribute",
      "writeAttribute",
      "readAttributeBeforeTypeCast",
      "attributesBeforeTypeCast",
      "columnForAttribute",
      "hasAttribute",
      "attributePresent",
    ]) {
      expect(Object.getOwnPropertyDescriptor(Base.prototype, name)).toBeDefined();
      expect(Object.getOwnPropertyDescriptor(Model.prototype, name)).toBeUndefined();
    }
  });

  it("keeps attributesBeforeTypeCast a getter rather than a data property", () => {
    // before_type_cast.rb:82 is a zero-arg reader, so it ports as an accessor
    // property; include() copies an object literal by value and would flatten
    // it into a data property holding the getter's one-time result.
    const descriptor = Object.getOwnPropertyDescriptor(Base.prototype, "attributesBeforeTypeCast")!;
    expect(typeof descriptor.get).toBe("function");
    expect("value" in descriptor).toBe(false);
  });
});
