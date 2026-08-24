import { describe, it, expect } from "vitest";
import { Model, Types, ValueType } from "./index.js";
import type { AttributeSet } from "./attribute-set.js";
import type { Type } from "./type.js";

/** Mirrors: attribute_registration_test.rb:7 — `MyType = Class.new(Type::Value)`. */
class MyType extends ValueType<unknown> {
  readonly name: string = "MyType";
}

const TYPE_1 = new MyType({ precision: 1 });
const TYPE_2 = new MyType({ precision: 2 });

/**
 * Mirrors: attribute_registration_test.rb:11-19 —
 * `MyDecorator = DelegateClass(Type::Value)` with a `name` reader and
 * `cast_type` aliased to the wrapped type. TypeScript has no `DelegateClass`,
 * so the delegation is the explicit `cast` forward.
 */
class MyDecorator extends ValueType<unknown> {
  readonly name: string;
  readonly castType: Type;

  constructor(name: string, castType: Type) {
    super();
    this.name = name;
    this.castType = castType;
  }

  cast(value: unknown): unknown {
    return (this.castType as ValueType<unknown>).cast(value);
  }
}

describe("AttributeRegistrationTest", () => {
  // Mirrors: attribute_registration_test.rb:247-250 — `class_with(base_class = nil, &block)`.
  function classWith(baseClass: typeof Model | null, block: (klass: any) => void): any {
    const klass = class extends (baseClass ?? Model) {};
    block(klass);
    return klass;
  }

  // Mirrors: attribute_registration_test.rb:252-254 — `default_attributes_for(&block)`.
  function defaultAttributesFor(block: (klass: any) => void): AttributeSet {
    return classWith(null, block)._defaultAttributes();
  }

  it("attributes can be registered", () => {
    class MyModel extends Model {
      static {
        this.attribute("title", "string");
      }
    }
    expect(MyModel.attributeNames()).toContain("title");
  });

  it("type options are forwarded when type is specified by name", () => {
    class MyModel extends Model {
      static {
        this.attribute("count", "integer");
      }
    }
    const m = new MyModel({ count: "5" });
    expect(m._readAttribute("count")).toBe(5);
  });

  it("default value can be specified", () => {
    class MyModel extends Model {
      static {
        this.attribute("status", "string", { default: "pending" });
      }
    }
    const m = new MyModel({});
    expect(m._readAttribute("status")).toBe("pending");
  });

  it("default value can be nil", () => {
    class MyModel extends Model {
      static {
        this.attribute("name", "string", { default: null });
      }
    }
    const m = new MyModel({});
    expect(m._readAttribute("name")).toBeNull();
  });

  it(".type_for_attribute returns the default type when an unregistered attribute is specified", () => {
    class MyModel extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const fallback = MyModel.typeForAttribute("unknown");
    expect(fallback).toBeInstanceOf(ValueType);
    expect(fallback.cast("anything")).toBe("anything");
  });

  it("attributeTypes returns a fallback ValueType for unknown keys", () => {
    class MyModel extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const types = MyModel.attributeTypes();
    expect(types["unknown"]).toBeInstanceOf(ValueType);
    expect(types["unknown"].cast("hello")).toBe("hello");
  });

  it("attributeTypes returns the registered type, not the fallback, for known keys", () => {
    class MyModel extends Model {
      static {
        this.attribute("count", "integer");
      }
    }
    const types = MyModel.attributeTypes();
    expect(types["count"].name).toBe("integer");
    expect(types["count"].cast("5")).toBe(5);
  });

  it("new attributes can be registered at any time", () => {
    class MyModel extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    MyModel.attribute("age", "integer");
    expect(MyModel.attributeNames()).toContain("age");
  });

  it("attributes are inherited", () => {
    class Parent extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    class Child extends Parent {
      static {
        this.attribute("age", "integer");
      }
    }
    expect(Child.attributeNames()).toContain("name");
    expect(Child.attributeNames()).toContain("age");
  });

  it("subclass attributes do not affect superclass", () => {
    class Parent extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    class Child extends Parent {
      static {
        this.attribute("age", "integer");
      }
    }
    expect(Parent.attributeNames()).not.toContain("age");
  });

  it("new superclass attributes are inherited even after subclass attributes are registered", () => {
    class Parent extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    class Child extends Parent {
      static {
        this.attribute("age", "integer");
      }
    }
    expect(Child.attributeNames()).toContain("name");
  });

  it("new superclass attributes do not override subclass attributes", () => {
    class Parent extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    class Child extends Parent {
      static {
        this.attribute("name", "integer");
      }
    }
    const c = new Child({ name: "5" });
    expect(c._readAttribute("name")).toBe(5);
  });

  it("superclass attributes can be overridden", () => {
    class Parent extends Model {
      static {
        this.attribute("name", "string", { default: "parent" });
      }
    }
    class Child extends Parent {
      static {
        this.attribute("name", "string", { default: "child" });
      }
    }
    const c = new Child({});
    expect(c._readAttribute("name")).toBe("child");
  });

  it("superclass default values can be overridden", () => {
    class Parent extends Model {
      static {
        this.attribute("status", "string", { default: "active" });
      }
    }
    class Child extends Parent {
      static {
        this.attribute("status", "string", { default: "inactive" });
      }
    }
    const c = new Child({});
    expect(c._readAttribute("status")).toBe("inactive");
  });

  it(".decorate_attributes decorates specified attributes", () => {
    const attributes = defaultAttributesFor((klass) => {
      klass.attribute("foo", TYPE_1);
      klass.attribute("bar", TYPE_2);
      klass.attribute("qux", TYPE_2);
      klass.decorateAttributes(
        ["foo", "bar"],
        (name: string, type: Type) => new MyDecorator(name, type),
      );
    });

    expect(attributes.getAttribute("foo").type).toBeInstanceOf(MyDecorator);
    expect(attributes.getAttribute("foo").type.name).toBe("foo");
    expect((attributes.getAttribute("foo").type as MyDecorator).castType).toBe(TYPE_1);

    expect(attributes.getAttribute("bar").type).toBeInstanceOf(MyDecorator);
    expect(attributes.getAttribute("bar").type.name).toBe("bar");
    expect((attributes.getAttribute("bar").type as MyDecorator).castType).toBe(TYPE_2);

    expect(attributes.getAttribute("qux").type).toBe(TYPE_2);
  });

  it(".decorate_attributes decorates all attributes when none are specified", () => {
    const attributes = defaultAttributesFor((klass) => {
      klass.attribute("foo", TYPE_1);
      klass.attribute("bar", TYPE_2);
      klass.decorateAttributes(null, (name: string, type: Type) => new MyDecorator(name, type));
    });

    expect((attributes.getAttribute("foo").type as MyDecorator).castType).toBe(TYPE_1);
    expect((attributes.getAttribute("bar").type as MyDecorator).castType).toBe(TYPE_2);
  });

  it(".decorate_attributes supports conditional decoration", () => {
    const attributes = defaultAttributesFor((klass) => {
      klass.attribute("foo", TYPE_1);
      klass.attribute("bar", TYPE_2);
      klass.decorateAttributes(null, (name: string, type: Type) =>
        /oo/.test(name) ? new MyDecorator(name, type) : null,
      );
    });

    expect((attributes.getAttribute("foo").type as MyDecorator).castType).toBe(TYPE_1);
    expect(attributes.getAttribute("bar").type).toBe(TYPE_2);
  });

  it(".decorate_attributes stacks decorators", () => {
    const attributes = defaultAttributesFor((klass) => {
      klass.attribute("foo", TYPE_1);
      klass.decorateAttributes(
        null,
        (name: string, type: Type) => new MyDecorator(`${name}1`, type),
      );
      klass.decorateAttributes(
        null,
        (name: string, type: Type) => new MyDecorator(`${name}2`, type),
      );
    });

    const type = attributes.getAttribute("foo").type as MyDecorator;
    expect(type).toBeInstanceOf(MyDecorator);
    expect(type.name).toBe("foo2");

    expect(type.castType).toBeInstanceOf(MyDecorator);
    expect((type.castType as MyDecorator).name).toBe("foo1");

    expect((type.castType as MyDecorator).castType).toBe(TYPE_1);
  });

  it("superclass attribute types can be decorated", () => {
    const parent = classWith(null, (klass: any) => {
      klass.attribute("foo", TYPE_1);
    });

    const child = classWith(parent, (klass: any) => {
      klass.decorateAttributes(null, (name: string, type: Type) => new MyDecorator(name, type));
    });

    expect(child._defaultAttributes().getAttribute("foo").type).toBeInstanceOf(MyDecorator);
    expect((child._defaultAttributes().getAttribute("foo").type as MyDecorator).castType).toBe(
      TYPE_1,
    );
    expect(parent._defaultAttributes().getAttribute("foo").type).toBe(TYPE_1);
  });

  it("re-registering an attribute overrides previous decorators", () => {
    const parent = classWith(null, (klass: any) => {
      klass.attribute("foo", TYPE_1);
      klass.decorateAttributes(null, (name: string, type: Type) => new MyDecorator(name, type));
    });

    const child = classWith(parent, (klass: any) => {
      klass.attribute("foo", TYPE_1);
    });

    expect(child._defaultAttributes().getAttribute("foo").type).toBe(TYPE_1);
  });

  it("the default type is used when type is omitted", () => {
    const stringType = Types.typeRegistry.lookup("string");
    expect(stringType.name).toBe("string");
    expect(stringType.cast("hello")).toBe("hello");
  });

  it("type is resolved when specified by name", () => {
    class Person extends Model {
      static {
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ age: "25" });
    expect(p._readAttribute("age")).toBe(25);
  });

  it(".attribute_types reflects registered attribute types", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const defs = Person._attributeDefinitions;
    expect(defs.get("name")!.type.name).toBe("string");
    expect(defs.get("age")!.type.name).toBe("integer");
  });

  it(".type_for_attribute returns the registered attribute type", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    expect(User.typeForAttribute("name")?.name).toBe("string");
    expect(User.typeForAttribute("age")?.name).toBe("integer");
  });

  it(".attribute_types returns the default type when key is missing", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    expect(Person.typeForAttribute("name").name).toBe("string");
    expect(Person.typeForAttribute("missing_key")).toBeInstanceOf(ValueType);
  });

  it("_pendingAttributeModifications queue is populated by attribute()", () => {
    class MyModel extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer", { default: 0 });
      }
    }
    const queue = (MyModel as any)._pendingAttributeModifications;
    expect(queue).toBeDefined();
    expect(queue.length).toBe(3);
  });

  it("_default_attributes seeds empty set and replays pending queue", () => {
    class MyModel extends Model {
      static {
        this.attribute("score", "integer", { default: 10 });
      }
    }
    const defaults = (MyModel as any)._defaultAttributes();
    expect(defaults.getAttribute("score").value).toBe(10);
  });

  it("pending queue from superclass is replayed before subclass queue", () => {
    class Parent extends Model {
      static {
        this.attribute("role", "string", { default: "user" });
      }
    }
    class Child extends Parent {
      static {
        this.attribute("role", "string", { default: "admin" });
      }
    }
    const defaults = (Child as any)._defaultAttributes();
    expect(defaults.getAttribute("role").value).toBe("admin");
  });

  it("adding an attribute to a superclass after a subclass has cached _defaultAttributes invalidates the subclass cache", () => {
    class Parent extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    class Child extends Parent {}

    const before = (Child as any)._defaultAttributes();
    expect(before.keys()).toContain("name");
    expect(before.keys()).not.toContain("age");

    Parent.attribute("age", "integer", { default: 42 });

    const after = (Child as any)._defaultAttributes();
    expect(after.getAttribute("age").value).toBe(42);
  });

  it("reset_default_attributes cascade propagates through multiple inheritance levels", () => {
    class Base extends Model {
      static {
        this.attribute("base_attr", "string");
      }
    }
    class Mid extends Base {}
    class Leaf extends Mid {}

    (Base as any)._defaultAttributes();
    (Mid as any)._defaultAttributes();
    (Leaf as any)._defaultAttributes();

    Base.attribute("new_attr", "integer", { default: 7 });

    expect((Leaf as any)._defaultAttributes().getAttribute("new_attr").value).toBe(7);
  });
});
