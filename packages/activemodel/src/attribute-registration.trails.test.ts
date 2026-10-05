import { describe, it, expect } from "vitest";
import { AttributeRegistration } from "./attribute-registration.js";
import { include } from "@blazetrails/activesupport";
import { Hash, hashAref } from "@blazetrails/ruby-compat";
import { Attribute } from "./attribute.js";
import { AttributeSet } from "./attribute-set.js";
import * as Type from "./type.js";
import { IntegerType } from "./type/integer.js";

function classWith(baseClass: any, block: (klass: any) => void): any {
  const klass = baseClass ? class extends baseClass {} : class {};
  include(klass, AttributeRegistration);
  block(klass);
  return klass;
}

describe("AttributeRegistration internals", () => {
  it("resolveAttributeName answers name.to_s", () => {
    const klass = classWith(null, () => {});
    expect(klass.resolveAttributeName(1)).toBe("1");
  });

  it("_pendingAttributeModifications queue is populated by attribute()", () => {
    const klass = classWith(null, (k) => {
      k.attribute("name", "string");
      k.attribute("age", "integer", { default: 0 });
    });

    expect(klass._pendingAttributeModifications).toBeDefined();
    expect(klass._pendingAttributeModifications.length).toBe(3);
  });

  it("adding an attribute to a superclass after a subclass has cached _defaultAttributes invalidates the subclass cache", () => {
    const parent = classWith(null, (k) => {
      k.attribute("name", "string");
    });
    const child = class extends parent {};

    const before = child._defaultAttributes();
    expect(before.keys()).toContain("name");
    expect(before.keys()).not.toContain("age");

    parent.attribute("age", "integer", { default: 42 });

    expect(child._defaultAttributes().getAttribute("age").value()).toBe(42);
  });

  it("reset_default_attributes cascade propagates through multiple inheritance levels", () => {
    const base = classWith(null, (k) => {
      k.attribute("base_attr", "string");
    });

    const mid: any = class extends base {};

    const leaf: any = class extends mid {};

    base._defaultAttributes();
    mid._defaultAttributes();
    leaf._defaultAttributes();

    base.attribute("new_attr", "integer", { default: 7 });

    expect(leaf._defaultAttributes().getAttribute("new_attr").value()).toBe(7);
  });

  it("attributeTypes seats Type.default_value on a Hash-held default set", () => {
    const klass = classWith(null, () => {});
    const intType = new IntegerType();
    const attributes = new Hash<string, Attribute>();
    attributes.set("age", Attribute.fromDatabase("age", 1, intType));
    klass._defaultAttributes = () => new AttributeSet(attributes);

    const types = klass.attributeTypes();
    expect(types).toBeInstanceOf(Hash);
    expect(hashAref(types, "age")).toBe(intType);
    expect(hashAref(types, "missing")).toBe(Type.defaultValue());
    expect(klass.typeForAttribute("missing")).toBe(Type.defaultValue());
  });
});
