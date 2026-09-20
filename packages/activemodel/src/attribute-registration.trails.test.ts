import { describe, it, expect } from "vitest";
import { AttributeRegistration } from "./attribute-registration.js";
import { include } from "@blazetrails/activesupport";

function classWith(baseClass: any, block: (klass: any) => void): any {
  const klass = baseClass ? class extends baseClass {} : class {};
  include(klass, AttributeRegistration);
  block(klass);
  return klass;
}

describe("AttributeRegistration internals", () => {
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

    expect(child._defaultAttributes().getAttribute("age").value).toBe(42);
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

    expect(leaf._defaultAttributes().getAttribute("new_attr").value).toBe(7);
  });
});
