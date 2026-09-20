import { describe, it, expect } from "vitest";
import { ValueType } from "./index.js";
import type { AttributeSet } from "./attribute-set.js";
import { AttributeRegistration } from "./attribute-registration.js";
import { typeRegistry } from "./type/registry.js";
import { include } from "@blazetrails/activesupport";

class MyType extends ValueType<unknown> {}
typeRegistry.register(MyType.name, MyType);

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
    const attributes = defaultAttributesFor((klass) => {
      klass.attribute("foo", TYPE_1);
    });
    expect(attributes.getAttribute("foo").type).toBe(TYPE_1);
  });

  it("the default type is used when type is omitted", () => {
    const attributes = defaultAttributesFor((klass) => {
      klass.attribute("foo");
    });
    expect(attributes.getAttribute("foo").type).toEqual(new ValueType());
  });

  it("type is resolved when specified by name", () => {
    const attributes = defaultAttributesFor((klass) => {
      klass.attribute("foo", MyType.name);
    });
    expect(attributes.getAttribute("foo").type).toBeInstanceOf(MyType);
  });

  it("type options are forwarded when type is specified by name", () => {
    const attributes = defaultAttributesFor((klass) => {
      klass.attribute("foo", MyType.name, { precision: 123 });
    });
    expect(attributes.getAttribute("foo").type!.precision).toEqual(123);
  });

  it("default value can be specified", () => {
    const attributes = defaultAttributesFor((klass) => {
      klass.attribute("foo", TYPE_1, { default: 123 });
      klass.attribute("bar", TYPE_2);
      klass.attribute("bar", { default: 456 });
    });

    expect(attributes.getAttribute("foo").type).toBe(TYPE_1);
    expect(attributes.getAttribute("foo").value).toEqual(123);
    expect(attributes.getAttribute("bar").type).toBe(TYPE_2);
    expect(attributes.getAttribute("bar").value).toEqual(456);
  });

  it("default value can be nil", () => {
    const attributes = defaultAttributesFor((klass) => {
      klass.attribute("foo", { default: null });
      klass.attribute("bar");
    });

    expect(attributes.getAttribute("foo").cameFromUser()).toBeTruthy();
    expect(attributes.getAttribute("bar").cameFromUser()).toBeFalsy();
  });

  it(".attribute_types reflects registered attribute types", () => {
    const klass = classWith(null, (klass) => {
      klass.attribute("foo", TYPE_1);
    });
    expect(klass.attributeTypes()["foo"]).toBe(TYPE_1);
  });

  it(".attribute_types returns the default type when key is missing", () => {
    const klass = classWith(null, (klass) => {
      klass.attribute("foo", TYPE_1);
    });
    expect(klass.attributeTypes()["bar"]).toEqual(new ValueType());
  });

  it(".type_for_attribute returns the registered attribute type", () => {
    const klass = classWith(null, (klass) => {
      klass.attribute("foo", TYPE_1);
    });
    expect(klass.typeForAttribute("foo")).toBe(TYPE_1);
    expect(klass.typeForAttribute("foo")).toBe(TYPE_1);
  });

  it(".type_for_attribute returns the default type when an unregistered attribute is specified", () => {
    const klass = classWith(null, (klass) => {
      klass.attribute("foo", TYPE_1);
    });
    expect(klass.typeForAttribute("bar")).toEqual(new ValueType());
  });

  it("new attributes can be registered at any time", () => {
    const klass = classWith(null, (klass) => {
      klass.attribute("foo", TYPE_1);
    });
    expect(klass._defaultAttributes().keys()).toContain("foo");
    expect(klass._defaultAttributes().keys()).not.toContain("bar");
    expect(klass.attributeTypes()["foo"]).toBe(TYPE_1);

    klass.attribute("bar", TYPE_2);
    expect(klass._defaultAttributes().keys()).toContain("foo");
    expect(klass._defaultAttributes().keys()).toContain("bar");
    expect(klass.attributeTypes()["foo"]).toBe(TYPE_1);
    expect(klass.attributeTypes()["bar"]).toBe(TYPE_2);
  });

  it("attributes are inherited", () => {
    const parent = classWith(null, (klass) => {
      klass.attribute("foo", TYPE_1, { default: 123 });
    });

    const child = class extends parent {};

    expect(parent._defaultAttributes().getAttribute("foo").type).toBe(
      child._defaultAttributes().getAttribute("foo").type,
    );
    expect(parent._defaultAttributes().getAttribute("foo").value).toBe(
      child._defaultAttributes().getAttribute("foo").value,
    );
  });

  it("subclass attributes do not affect superclass", () => {
    const parent = classWith(null, (klass) => {
      klass.attribute("foo");
    });
    const child = classWith(parent, (klass) => {
      klass.attribute("bar");
    });

    expect(parent._defaultAttributes().keys()).not.toContain("bar");
    expect(child._defaultAttributes().keys()).toContain("bar");
  });

  it("new superclass attributes are inherited even after subclass attributes are registered", () => {
    const parent = classWith(null, (klass) => {
      klass.attribute("foo");
    });
    const child = classWith(parent, (klass) => {
      klass.attribute("bar");
    });
    parent.attribute("qux");

    expect(child._defaultAttributes().keys()).toContain("qux");
  });

  it("new superclass attributes do not override subclass attributes", () => {
    const parent = classWith(null, (klass) => {
      klass.attribute("bar");
    });
    const child = classWith(parent, (klass) => {
      klass.attribute("foo", TYPE_1);
    });
    parent.attribute("foo", TYPE_2);

    expect(child._defaultAttributes().getAttribute("foo").type).toBe(TYPE_1);
  });

  it("superclass attributes can be overridden", () => {
    const parent = classWith(null, (klass) => {
      klass.attribute("foo", TYPE_1);
    });
    const child = classWith(parent, (klass) => {
      klass.attribute("foo", TYPE_2);
    });

    expect(child._defaultAttributes().getAttribute("foo").type).toBe(TYPE_2);
    expect(parent._defaultAttributes().getAttribute("foo").type).toBe(TYPE_1);
  });

  it("superclass default values can be overridden", () => {
    const parent = classWith(null, (klass) => {
      klass.attribute("foo", TYPE_1, { default: 123 });
      klass.attribute("bar", TYPE_2);
    });

    const child = classWith(parent, (klass) => {
      klass.attribute("foo", { default: 456 });
      klass.attribute("bar", { default: 789 });
    });

    expect(child._defaultAttributes().getAttribute("foo").type).toBe(TYPE_1);
    expect(child._defaultAttributes().getAttribute("bar").type).toBe(TYPE_2);
    expect(child._defaultAttributes().getAttribute("foo").value).toEqual(456);
    expect(child._defaultAttributes().getAttribute("bar").value).toEqual(789);
    expect(parent._defaultAttributes().getAttribute("foo").value).toEqual(123);
    expect(parent._defaultAttributes().getAttribute("bar").value).toBeNull();
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
    expect((attributes.getAttribute("foo").type as MyDecorator).name).toEqual("foo");
    expect((attributes.getAttribute("foo").type as MyDecorator).castType).toBe(TYPE_1);

    expect(attributes.getAttribute("bar").type).toBeInstanceOf(MyDecorator);
    expect((attributes.getAttribute("bar").type as MyDecorator).name).toEqual("bar");
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

    expect(attributes.getAttribute("foo").type).toBeInstanceOf(MyDecorator);
    expect((attributes.getAttribute("foo").type as MyDecorator).name).toEqual("foo2");

    expect((attributes.getAttribute("foo").type as MyDecorator).castType).toBeInstanceOf(
      MyDecorator,
    );
    expect(
      ((attributes.getAttribute("foo").type as MyDecorator).castType as MyDecorator).name,
    ).toEqual("foo1");

    expect(
      ((attributes.getAttribute("foo").type as MyDecorator).castType as MyDecorator).castType,
    ).toBe(TYPE_1);
  });

  it("superclass attribute types can be decorated", () => {
    const parent = classWith(null, (klass) => {
      klass.attribute("foo", TYPE_1);
    });

    const child = classWith(parent, (klass) => {
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
    const parent = classWith(null, (klass) => {
      klass.attribute("foo", TYPE_1);
      klass.decorateAttributes(
        null,
        (name: string, type: ValueType) => new MyDecorator(name, type),
      );
    });

    const child = classWith(parent, (klass) => {
      klass.attribute("foo", TYPE_1);
    });

    expect(child._defaultAttributes().getAttribute("foo").type).toBe(TYPE_1);
  });
});
