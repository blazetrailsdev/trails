/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { Model, Types, ValueType } from "./index.js";
import type { AttributeSet } from "./attribute-set.js";
import { AttributeRegistration } from "./attribute-registration.js";
import { Attributes, type AttributesClassHalf } from "./attributes.js";
import { include } from "@blazetrails/activesupport";

class MyType extends ValueType<unknown> {
  readonly name: string = "MyType";
}

const TYPE_1 = new MyType({ precision: 1 });
const TYPE_2 = new MyType({ precision: 2 });

class MyDecorator extends ValueType<unknown> {
  readonly name: string;
  readonly castType: ValueType;

  constructor(name: string, castType: ValueType) {
    super();
    this.name = name;
    this.castType = castType;
  }

  cast(value: unknown): unknown {
    return this.castType.cast(value);
  }
}

describe("AttributeRegistrationTest", () => {
  function classWith(baseClass: any, block: (klass: any) => void): any {
    const klass = baseClass ? class extends baseClass {} : class {};
    include(klass, AttributeRegistration);
    block(klass);
    return klass;
  }

  function defaultAttributesFor(block: (klass: any) => void): AttributeSet {
    return classWith(null, block)._defaultAttributes();
  }

  it("attributes can be registered", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeNames: AttributesClassHalf["attributeNames"];
      declare static attributeTypes: AttributesClassHalf["attributeTypes"];
      declare static typeForAttribute: AttributesClassHalf["typeForAttribute"];

      static {
        include(this, Attributes);
        this.attribute("title", "string");
      }
    }
    interface MyModel extends Attributes {}

    expect(MyModel.attributeNames()).toContain("title");
  });

  it("type options are forwarded when type is specified by name", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("count", "integer");
      }
    }
    interface MyModel extends Attributes {}

    const m = new MyModel({ count: "5" });
    expect(m._readAttribute("count")).toBe(5);
  });

  it("default value can be specified", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("status", "string", { default: "pending" });
      }
    }
    interface MyModel extends Attributes {}

    const m = new MyModel({});
    expect(m._readAttribute("status")).toBe("pending");
  });

  it("default value can be nil", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string", { default: null });
      }
    }
    interface MyModel extends Attributes {}

    const m = new MyModel({});
    expect(m._readAttribute("name")).toBeNull();
  });

  it(".type_for_attribute returns the default type when an unregistered attribute is specified", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static typeForAttribute: AttributesClassHalf["typeForAttribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface MyModel extends Attributes {}

    const fallback = MyModel.typeForAttribute("unknown")!;
    expect(fallback).toBeInstanceOf(ValueType);
    expect(fallback.cast("anything")).toBe("anything");
  });

  it("attributeTypes returns a fallback ValueType for unknown keys", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeTypes: AttributesClassHalf["attributeTypes"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface MyModel extends Attributes {}

    const types = MyModel.attributeTypes();
    expect(types["unknown"]).toBeInstanceOf(ValueType);
    expect(types["unknown"]!.cast("hello")).toBe("hello");
  });

  it("attributeTypes returns the registered type, not the fallback, for known keys", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeTypes: AttributesClassHalf["attributeTypes"];

      static {
        include(this, Attributes);
        this.attribute("count", "integer");
      }
    }
    interface MyModel extends Attributes {}

    const types = MyModel.attributeTypes();
    expect(types["count"]!.type()).toBe("integer");
    expect(types["count"]!.cast("5")).toBe(5);
  });

  it("new attributes can be registered at any time", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeNames: AttributesClassHalf["attributeNames"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface MyModel extends Attributes {}

    MyModel.attribute("age", "integer");
    expect(MyModel.attributeNames()).toContain("age");
  });

  it("attributes are inherited", () => {
    class Parent extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeNames: AttributesClassHalf["attributeNames"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Parent extends Attributes {}

    class Child extends Parent {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeNames: AttributesClassHalf["attributeNames"];

      static {
        this.attribute("age", "integer");
      }
    }
    expect(Child.attributeNames()).toContain("name");
    expect(Child.attributeNames()).toContain("age");
  });

  it("subclass attributes do not affect superclass", () => {
    class Parent extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeNames: AttributesClassHalf["attributeNames"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Parent extends Attributes {}

    class Child extends Parent {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        this.attribute("age", "integer");
      }
    }
    expect(Parent.attributeNames()).not.toContain("age");
  });

  it("new superclass attributes are inherited even after subclass attributes are registered", () => {
    class Parent extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Parent extends Attributes {}

    class Child extends Parent {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeNames: AttributesClassHalf["attributeNames"];

      static {
        this.attribute("age", "integer");
      }
    }
    expect(Child.attributeNames()).toContain("name");
  });

  it("new superclass attributes do not override subclass attributes", () => {
    class Parent extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Parent extends Attributes {}

    class Child extends Parent {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        this.attribute("name", "integer");
      }
    }
    const c = new Child({ name: "5" });
    expect(c._readAttribute("name")).toBe(5);
  });

  it("superclass attributes can be overridden", () => {
    class Parent extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string", { default: "parent" });
      }
    }
    interface Parent extends Attributes {}

    class Child extends Parent {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        this.attribute("name", "string", { default: "child" });
      }
    }
    const c = new Child({});
    expect(c._readAttribute("name")).toBe("child");
  });

  it("superclass default values can be overridden", () => {
    class Parent extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("status", "string", { default: "active" });
      }
    }
    interface Parent extends Attributes {}

    class Child extends Parent {
      declare static attribute: AttributesClassHalf["attribute"];

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
        (name: string, type: ValueType) => new MyDecorator(name, type),
      );
    });

    expect(attributes.getAttribute("foo").type).toBeInstanceOf(MyDecorator);
    expect((attributes.getAttribute("foo").type as MyDecorator).name).toBe("foo");
    expect((attributes.getAttribute("foo").type as MyDecorator).castType).toBe(TYPE_1);

    expect(attributes.getAttribute("bar").type).toBeInstanceOf(MyDecorator);
    expect((attributes.getAttribute("bar").type as MyDecorator).name).toBe("bar");
    expect((attributes.getAttribute("bar").type as MyDecorator).castType).toBe(TYPE_2);

    expect(attributes.getAttribute("qux").type).toBe(TYPE_2);
  });

  it(".decorate_attributes decorates all attributes when none are specified", () => {
    const attributes = defaultAttributesFor((klass) => {
      klass.attribute("foo", TYPE_1);
      klass.attribute("bar", TYPE_2);
      klass.decorateAttributes(
        null,
        (name: string, type: ValueType) => new MyDecorator(name, type),
      );
    });

    expect((attributes.getAttribute("foo").type as MyDecorator).castType).toBe(TYPE_1);
    expect((attributes.getAttribute("bar").type as MyDecorator).castType).toBe(TYPE_2);
  });

  it(".decorate_attributes supports conditional decoration", () => {
    const attributes = defaultAttributesFor((klass) => {
      klass.attribute("foo", TYPE_1);
      klass.attribute("bar", TYPE_2);
      klass.decorateAttributes(null, (name: string, type: ValueType) =>
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
        (name: string, type: ValueType) => new MyDecorator(`${name}1`, type),
      );
      klass.decorateAttributes(
        null,
        (name: string, type: ValueType) => new MyDecorator(`${name}2`, type),
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
      klass.decorateAttributes(
        null,
        (name: string, type: ValueType) => new MyDecorator(name, type),
      );
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
      klass.decorateAttributes(
        null,
        (name: string, type: ValueType) => new MyDecorator(name, type),
      );
    });

    const child = classWith(parent, (klass: any) => {
      klass.attribute("foo", TYPE_1);
    });

    expect(child._defaultAttributes().getAttribute("foo").type).toBe(TYPE_1);
  });

  it("the default type is used when type is omitted", () => {
    const stringType = Types.typeRegistry.lookup("string");
    expect(stringType.type()).toBe("string");
    expect(stringType.cast("hello")).toBe("hello");
  });

  it("type is resolved when specified by name", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeTypes: AttributesClassHalf["attributeTypes"];
      declare static typeForAttribute: AttributesClassHalf["typeForAttribute"];

      static {
        include(this, Attributes);
        this.attribute("age", "integer");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ age: "25" });
    expect(p._readAttribute("age")).toBe(25);
  });

  it(".attribute_types reflects registered attribute types", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeTypes: AttributesClassHalf["attributeTypes"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Person extends Attributes {}

    const types = Person.attributeTypes();
    expect(types["name"]!.type()).toBe("string");
    expect(types["age"]!.type()).toBe("integer");
  });

  it(".type_for_attribute returns the registered attribute type", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static typeForAttribute: AttributesClassHalf["typeForAttribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface User extends Attributes {}

    expect(User.typeForAttribute("name")?.type()).toBe("string");
    expect(User.typeForAttribute("age")?.type()).toBe("integer");
  });

  it(".attribute_types returns the default type when key is missing", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static typeForAttribute: AttributesClassHalf["typeForAttribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    expect(Person.typeForAttribute("name")!.type()).toBe("string");
    expect(Person.typeForAttribute("missing_key")).toBeInstanceOf(ValueType);
  });

  it("_pendingAttributeModifications queue is populated by attribute()", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("age", "integer", { default: 0 });
      }
    }
    interface MyModel extends Attributes {}

    const queue = (MyModel as any)._pendingAttributeModifications;
    expect(queue).toBeDefined();
    expect(queue.length).toBe(3);
  });

  it("_default_attributes seeds empty set and replays pending queue", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("score", "integer", { default: 10 });
      }
    }
    interface MyModel extends Attributes {}

    const defaults = (MyModel as any)._defaultAttributes();
    expect(defaults.getAttribute("score").value).toBe(10);
  });

  it("pending queue from superclass is replayed before subclass queue", () => {
    class Parent extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("role", "string", { default: "user" });
      }
    }
    interface Parent extends Attributes {}

    class Child extends Parent {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        this.attribute("role", "string", { default: "admin" });
      }
    }
    const defaults = (Child as any)._defaultAttributes();
    expect(defaults.getAttribute("role").value).toBe("admin");
  });

  it("adding an attribute to a superclass after a subclass has cached _defaultAttributes invalidates the subclass cache", () => {
    class Parent extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Parent extends Attributes {}

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
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("base_attr", "string");
      }
    }
    interface Base extends Attributes {}

    class Mid extends Base {}
    class Leaf extends Mid {}

    (Base as any)._defaultAttributes();
    (Mid as any)._defaultAttributes();
    (Leaf as any)._defaultAttributes();

    Base.attribute("new_attr", "integer", { default: 7 });

    expect((Leaf as any)._defaultAttributes().getAttribute("new_attr").value).toBe(7);
  });
});
