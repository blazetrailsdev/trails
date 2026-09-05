import { describe, it, expect } from "vitest";
import { Attribute } from "./attribute.js";
import { AttributeSet } from "./attribute-set.js";
import { typeRegistry } from "./type/registry.js";
import { FrozenError } from "@blazetrails/ruby-compat";

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

  it("every writer on a frozen set raises FrozenError, as Ruby's frozen Hash does", () => {
    const frozen = (): AttributeSet =>
      new AttributeSet({
        foo: Attribute.fromDatabase("foo", 1, typeRegistry.lookup("integer")),
      }).freeze();

    expect(() =>
      frozen().set("bar", Attribute.fromDatabase("bar", 2, typeRegistry.lookup("integer"))),
    ).toThrow(FrozenError);
    expect(() => frozen().writeFromDatabase("bar", 2)).toThrow(FrozenError);
    expect(() => frozen().writeCastValue("bar", 2)).toThrow(FrozenError);
    expect(() => frozen().writeFromUser("bar", 2)).toThrow(FrozenError);
    expect(() => frozen().writeFromUser("foo", 2)).toThrow("can't modify frozen attributes");
    expect(() => frozen().freeze().freeze()).not.toThrow();
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
