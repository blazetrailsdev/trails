import { describe, it, expect, vi } from "vitest";
import { Base, DangerousAttributeError, ReadonlyAttributeError, registerModel } from "./index.js";
import { Model } from "@blazetrails/activemodel";
import {
  attributesForCreate,
  GeneratedAttributeMethods,
  isMethodDefinedWithin,
} from "./attribute-methods.js";
import { formatForInspect } from "./attribute-inspection.js";
import { registerSubclass } from "./inheritance.js";

import { fixtures } from "./test-fixtures.js";
import { assertQueriesMatch } from "./testing/query-assertions.js";
import { Minivan } from "./test-helpers/models/minivan.js";
import { CpkBook, CpkOrder } from "./test-helpers/models/cpk.js";

registerModel(Minivan);
registerModel(CpkBook);
registerModel(CpkOrder);

interface Generatable {
  defineAttributeMethods(): boolean;
  _attributeMethodsGenerated?: boolean;
}
const generatable = (cls: unknown): Generatable => cls as Generatable;

describe("AttributeMethodsTest (trails)", () => {
  fixtures([]);

  it("a class-body attribute and aliasAttribute leave one GeneratedAttributeMethods", async () => {
    class Legacy extends Base {
      declare heading: unknown;
      static {
        this.attribute("title", "string");
        this.aliasAttribute("heading", "title");
      }
    }
    generatable(Legacy).defineAttributeMethods();

    expect(Legacy._generatedAttributeMethods).toBeInstanceOf(GeneratedAttributeMethods);
    expect(new Legacy({ title: "t" }).heading).toBe("t");
  });

  it("a class reached only through isInstanceMethodAlreadyImplemented holds a GeneratedAttributeMethods", () => {
    class Middle extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    class Leaf extends Middle {}

    (
      Leaf as unknown as { isInstanceMethodAlreadyImplemented(name: string): boolean }
    ).isInstanceMethodAlreadyImplemented("title");

    expect(Object.prototype.hasOwnProperty.call(Leaf, "_generatedAttributeMethods")).toBe(true);
    expect(Leaf._generatedAttributeMethods).toBeInstanceOf(GeneratedAttributeMethods);
    expect(Leaf._generatedAttributeMethods!.inspect()).toBe("Leaf::GeneratedAttributeMethods");
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

  it("attribute_present? is empty?, not blank?", () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("content", "string");
        this.aliasAttribute("heading", "title");
      }
    }
    const t = new Topic({ title: " ", content: "" });
    expect(t.attributePresent("title")).toBe(true);
    expect(t.attributePresent("heading")).toBe(true);
    expect(t.attributePresent("content")).toBe(false);
  });

  it("readonly attributes are not updated after create", async () => {
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
    expect(NonExistentTable.attributeNames()).toEqual(["name"]);
    await NonExistentTable.loadSchema();
    expect(NonExistentTable.attributeNames()).toEqual([]);
  });

  it("aliasing an attribute onto an Active Record method raises DangerousAttributeError", () => {
    class Employee extends Base {
      static {
        this.attribute("name", "string");
      }
    }

    Employee.aliasAttribute("save", "name");

    expect(() => Employee.generateAliasAttributes()).toThrow(DangerousAttributeError);
  });

  it("an ordinary class-body method is not overridden by a generated attribute method", () => {
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
    class Middle extends Base {
      static {
        this.attribute("name", "string");
        this.aliasAttribute("nickname", "name");
      }
    }
    class Leaf extends Middle {}

    Middle.generateAliasAttributes();

    const host = Leaf as unknown as { isInstanceMethodAlreadyImplemented(n: string): boolean };
    expect("nickname" in (Leaf.prototype as object)).toBe(true);
    expect(host.isInstanceMethodAlreadyImplemented("nickname")).toBe(false);
  });

  it("a schema load does not mass-generate alias attribute methods", async () => {
    class Loaded extends Base {
      static tableName = "topics";
      static {
        this.aliasAttribute("heading", "not_a_column");
      }
    }
    const massGenerated = Loaded as unknown as { _aliasAttributesMassGenerated?: boolean };
    await Loaded.loadSchema();

    expect(massGenerated._aliasAttributesMassGenerated).toBeFalsy();
    expect("heading" in (Loaded.prototype as object)).toBe(false);

    new Loaded();

    expect(massGenerated._aliasAttributesMassGenerated).toBe(true);
    expect("heading" in (Loaded.prototype as object)).toBe(true);
  });

  it("aliasAttribute generates the alias when mass generation already ran", () => {
    class Late extends Base {
      declare heading: unknown;
      static {
        this.attribute("title", "string");
      }
    }
    Late.generateAliasAttributes();

    Late.aliasAttribute("heading", "title");

    expect("heading" in (Late.prototype as object)).toBe(true);
    expect(new Late({ title: "t" }).heading).toBe("t");
  });

  it("an inherited generated dirty accessor does not suppress the subclass's own generation", () => {
    class Middle extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class Leaf extends Middle {}

    (Middle as unknown as { defineAttributeMethods(): boolean }).defineAttributeMethods();

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
    const employee = new Employee({}) as unknown as { nameChanged: unknown };
    expect(typeof employee.nameChanged).toBe("function");

    (Employee as unknown as { undefineAttributeMethods(): void }).undefineAttributeMethods();

    expect(employee.nameChanged).toBeUndefined();
  });

  it("seats one generated-methods carrier when construction generates first", () => {
    class Employee extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    new Employee({});

    let carriers = 0;
    for (
      let link: object | null = Employee.prototype;
      link;
      link = Object.getPrototypeOf(link) as object | null
    ) {
      if (Object.prototype.hasOwnProperty.call(link, "nameChanged")) carriers += 1;
    }
    expect(carriers).toBe(1);
  });

  it("generates once when the schema load drives generation first", () => {
    class Widget extends Base {
      static override tableName = "posts";
    }
    const spy = vi.spyOn(
      Widget as unknown as { defineMethodAttribute(name: string): void },
      "defineMethodAttribute",
    );

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

describe("define_attribute_methods abstract gate (trails)", () => {
  fixtures({});

  it("an abstract class generates no per-attribute accessors and its concrete subclass does", () => {
    class AbstractTopic extends Base {
      static tableName = "topics";
      static {
        this.abstractClass = true;
        this.attribute("author_name", "string");
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

class AccessTopic extends Base {
  static {
    this.attribute("title", "string");
    this.attribute("body", "string");
  }
}
type TrackingTopic = InstanceType<typeof AccessTopic> & {
  title: string;
  slice(...names: string[]): Record<string, unknown>;
  valuesAt(...names: string[]): unknown[];
};

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

  it.each([
    ["readAttribute", (t: TrackingTopic) => t.readAttribute("title")],
    ["the generated reader", (t: TrackingTopic) => t.title],
    ["slice", (t: TrackingTopic) => t.slice("title")],
    ["valuesAt", (t: TrackingTopic) => t.valuesAt("title")],
  ] as const)("marks the field accessed when read through %s", (_label, read) => {
    const t = AccessTopic.new({ title: "access-test", body: "hello" }) as TrackingTopic;
    expect(t.accessedFields()).toEqual([]);
    read(t);
    expect(t.accessedFields()).toEqual(["title"]);
  });
});

describe("attributesForCreate (trails)", () => {
  fixtures([]);

  it("keeps a nil composite primary key member", async () => {
    await CpkBook.loadSchema();
    const book = new CpkBook({ author_id: 1, title: "The Rails Way" });
    expect(attributesForCreate.call(book as never, book.attributeNames())).toContain("id");
  });

  it("inserts a nil composite primary key member on create", async () => {
    const oldPartialInserts = CpkOrder.partialInserts;
    CpkOrder.partialInserts = false;
    try {
      let order: CpkOrder | undefined;
      await assertQueriesMatch(/INSERT INTO[^(]+\([^)]*shop_id/i, 1, false, async () => {
        order = await CpkOrder.create({ status: "paid" });
      });
      expect(order?.shop_id).toBeNull();
    } finally {
      CpkOrder.partialInserts = oldPartialInserts;
    }
  });

  it("drops the primary key of a scalar-keyed record with no id", async () => {
    await Minivan.loadSchema();
    const minivan = new Minivan({ name: "cool.car" });
    expect(attributesForCreate.call(minivan as never, minivan.attributeNames())).not.toContain(
      "minivan_id",
    );
  });
});
