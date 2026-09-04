import { describe, it, expect } from "vitest";
import { Attribute } from "./attribute.js";
import { AttributeSet } from "./attribute-set.js";
import { typeRegistry } from "./type/registry.js";

describe("AttributeSetTest", () => {
  it("freeze freezes the attributes hash", () => {
    const attributes = new AttributeSet({
      foo: Attribute.fromDatabase("foo", 1, typeRegistry.lookup("integer")),
    });

    attributes.freeze();

    expect(() =>
      attributes.set("bar", Attribute.fromDatabase("bar", 2, typeRegistry.lookup("integer"))),
    ).toThrow();
    expect(attributes.keys()).toEqual(["foo"]);
  });

  it("initialize_dup gives the copy its own attributes hash", () => {
    const attributes = new AttributeSet({
      foo: Attribute.fromDatabase("foo", 1, typeRegistry.lookup("integer")),
    });
    const duped = Object.assign(
      Object.create(Object.getPrototypeOf(attributes) as object),
      attributes,
    ) as AttributeSet;

    duped.initializeDup(attributes);
    duped.writeFromDatabase("bar", 2);

    expect(duped.keys()).toEqual(["foo", "bar"]);
    expect(attributes.keys()).toEqual(["foo"]);
  });
});
