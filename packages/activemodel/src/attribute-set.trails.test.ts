import { describe, it, expect } from "vitest";
import { Attribute } from "./attribute.js";
import { AttributeSet } from "./attribute-set.js";
import { typeRegistry } from "./type/registry.js";
import { Builder } from "./attribute-set/builder.js";
import { IntegerType } from "./type/integer.js";
import { StringType } from "./type/string.js";
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
    expect(() => frozen().writeFromDatabase("foo", 2)).toThrow(FrozenError);
    expect(() => frozen().writeCastValue("foo", 2)).toThrow(FrozenError);
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
    duped.set("bar", Attribute.fromDatabase("bar", 2, typeRegistry.lookup("integer")));

    expect(duped.keys()).toEqual(["foo", "bar"]);
    expect(attributes.keys()).toEqual(["foo"]);
  });
  it("#cast_types returns a hash of attribute types", () => {
    const builder = new Builder({ foo: new IntegerType(), bar: new StringType() });
    const attributes = builder.buildFromDatabase({ foo: 1, bar: "a" });
    const types = attributes.castTypes();
    expect(types.foo).toBeInstanceOf(IntegerType);
    expect(types.bar).toBeInstanceOf(StringType);
  });

  it("#key? returns true for initialized attributes", () => {
    const builder = new Builder({ foo: new IntegerType(), bar: new StringType() });
    const attributes = builder.buildFromDatabase({ foo: 1, bar: "a" });
    expect(attributes.isKey("foo")).toBe(true);
    expect(attributes.isKey("bar")).toBe(true);
    expect(attributes.isKey("nonexistent")).toBe(false);
  });

  it("#reverse_merge! fills missing attributes from target", () => {
    const strType = typeRegistry.lookup("string");
    const intType = typeRegistry.lookup("integer");
    const a = new AttributeSet({ name: Attribute.fromDatabase("name", "Alice", strType) });
    const b = new AttributeSet({
      name: Attribute.fromDatabase("name", "Bob", strType),
      age: Attribute.fromDatabase("age", 30, intType),
    });
    a.reverseMergeBang(b);
    expect(a.fetchValue("name")).toBe("Alice");
    expect(a.fetchValue("age")).toBe(30);
  });

  it("fetch returns the attribute for the given name", () => {
    const intType = typeRegistry.lookup("integer");
    const foo = Attribute.fromDatabase("foo", 1, intType);
    const set = new AttributeSet({ foo });
    expect(set.fetch("foo")).toBe(foo);
  });

  it("fetch raises for an unknown name without a block", () => {
    const set = new AttributeSet({});
    expect(() => set.fetch("wibble")).toThrow();
  });

  it("fetch uses the given block for an unknown name", () => {
    const set = new AttributeSet({});
    const fallback = Attribute.null("wibble");
    expect(set.fetch("wibble", () => fallback)).toBe(fallback);
  });

  it("fetch returns the given default value for an unknown name", () => {
    const set = new AttributeSet({});
    const fallback = Attribute.null("wibble");
    expect(set.fetch("wibble", fallback)).toBe(fallback);
  });

  it("except returns a copy without the given names", () => {
    const intType = typeRegistry.lookup("integer");
    const set = new AttributeSet({
      foo: Attribute.fromDatabase("foo", 1, intType),
      bar: Attribute.fromDatabase("bar", 2, intType),
    });
    const rest = set.except("foo");
    expect(Object.hasOwn(rest, "foo")).toBe(false);
    expect(Object.hasOwn(rest, "bar")).toBe(true);
  });

  it("each_value yields every attribute", () => {
    const intType = typeRegistry.lookup("integer");
    const set = new AttributeSet({
      foo: Attribute.fromDatabase("foo", 1, intType),
      bar: Attribute.fromDatabase("bar", 2, intType),
    });
    const seen: unknown[] = [];
    set.eachValue((attr) => seen.push(attr.value));
    expect(seen).toEqual([1, 2]);
  });

  it("include? returns true for initialized attributes", () => {
    const intType = typeRegistry.lookup("integer");
    const set = new AttributeSet({ foo: Attribute.fromDatabase("foo", 1, intType) });
    expect(set.isInclude("foo")).toBe(true);
    expect(set.isInclude("bar")).toBe(false);
  });
  it("treats an Object.prototype name as an ordinary absent attribute", () => {
    const set = new AttributeSet({});
    expect(set.isKey("toString")).toBe(false);
    expect(set.getAttribute("toString").value).toBeNull();
    expect(set.getAttribute("constructor").value).toBeNull();
  });

  it("stores __proto__ as an ordinary key", () => {
    const set = new AttributeSet({});
    const attr = Attribute.fromDatabase("__proto__", 1, typeRegistry.lookup("integer"));
    set.set("__proto__", attr);
    expect(set.isKey("__proto__")).toBe(true);
    expect(set.getAttribute("__proto__")).toBe(attr);
    expect(set.deepDup().isKey("__proto__")).toBe(true);
    expect(Object.hasOwn(set.except("foo"), "__proto__")).toBe(true);
  });
});
