import { describe, it, expect } from "vitest";
import { Attribute } from "./attribute.js";
import { AttributeSet } from "./attribute-set.js";
import { Builder } from "./attribute-set/builder.js";
import { ValueType } from "./type/value.js";
import { FloatType } from "./type/float.js";
import { IntegerType } from "./type/integer.js";
import { StringType } from "./type/string.js";
import { assertNil } from "@blazetrails/activesupport";

describe("AttributeSetTest", () => {
  it("building a new set from raw attributes", () => {
    const builder = new Builder({ foo: new IntegerType(), bar: new FloatType() });
    const attributes = builder.buildFromDatabase({ foo: "1.1", bar: "2.2" });

    expect(attributes.getAttribute("foo").value).toEqual(1);
    expect(attributes.getAttribute("bar").value).toEqual(2.2);
    expect(attributes.getAttribute("foo").name).toEqual("foo");
    expect(attributes.getAttribute("bar").name).toEqual("bar");
  });

  it("building with custom types", () => {
    const builder = new Builder({ foo: new FloatType() });
    const attributes = builder.buildFromDatabase(
      { foo: "3.3", bar: "4.4" },
      { bar: new IntegerType() },
    );

    expect(attributes.getAttribute("foo").value).toEqual(3.3);
    expect(attributes.getAttribute("bar").value).toEqual(4);
  });

  it("[] returns a null object", () => {
    const builder = new Builder({ foo: new FloatType() });
    const attributes = builder.buildFromDatabase({ foo: "3.3" });

    expect(attributes.getAttribute("foo").valueBeforeTypeCast).toEqual("3.3");
    assertNil(attributes.getAttribute("bar").valueBeforeTypeCast);
    expect(attributes.getAttribute("bar").name).toEqual("bar");
  });

  // BLOCKED: assertions-immutable-js-string-values
  it.skip("duping creates a new hash, but does not dup the attributes", () => {
    const builder = new Builder({ foo: new IntegerType(), bar: new StringType() });
    const attributes = builder.buildFromDatabase({ foo: 1, bar: "foo" });

    void attributes.getAttribute("foo").value;
    void attributes.getAttribute("bar").value;

    const duped = attributes.deepDup();
    duped.writeFromDatabase("foo", 2);
    (duped.getAttribute("bar").value as string[]).push("bar");

    expect(attributes.getAttribute("foo").value).toEqual(1);
    expect(duped.getAttribute("foo").value).toEqual(2);
    expect(attributes.getAttribute("bar").value).toEqual("foobar");
    expect(duped.getAttribute("bar").value).toEqual("foobar");
  });

  // BLOCKED: assertions-immutable-js-string-values
  it.skip("deep_duping creates a new hash and dups each attribute", () => {
    const builder = new Builder({ foo: new IntegerType(), bar: new StringType() });
    const attributes = builder.buildFromDatabase({ foo: 1, bar: "foo" });

    void attributes.getAttribute("foo").value;
    void attributes.getAttribute("bar").value;

    const duped = attributes.deepDup();
    duped.writeFromDatabase("foo", 2);
    (duped.getAttribute("bar").value as string[]).push("bar");

    expect(attributes.getAttribute("foo").value).toEqual(1);
    expect(duped.getAttribute("foo").value).toEqual(2);
    expect(attributes.getAttribute("bar").value).toEqual("foo");
    expect(duped.getAttribute("bar").value).toEqual("foobar");
  });

  it("freezing cloned set does not freeze original", () => {
    const attributes = new AttributeSet({});
    const clone = Object.create(Object.getPrototypeOf(attributes) as object) as AttributeSet;
    Object.assign(clone, attributes);
    clone.initializeClone(attributes);

    clone.freeze();

    expect(Object.isFrozen(clone)).toBeTruthy();
    expect(Object.isFrozen(attributes)).toBeFalsy();
  });

  it("to_hash returns a hash of the type cast values", () => {
    const builder = new Builder({ foo: new IntegerType(), bar: new FloatType() });
    const attributes = builder.buildFromDatabase({ foo: "1.1", bar: "2.2" });

    expect(attributes.toHash()).toEqual({ foo: 1, bar: 2.2 });
    expect(attributes.toHash()).toEqual({ foo: 1, bar: 2.2 });
  });

  it("to_hash maintains order", () => {
    const builder = new Builder({ foo: new IntegerType(), bar: new FloatType() });
    const attributes = builder.buildFromDatabase({ foo: "2.2", bar: "3.3" });

    attributes.getAttribute("bar");
    const hash = attributes.toHash();

    expect(Object.entries(hash)).toEqual([
      ["foo", 2],
      ["bar", 3.3],
    ]);
  });

  it("values_before_type_cast", () => {
    const builder = new Builder({ foo: new IntegerType(), bar: new IntegerType() });
    const attributes = builder.buildFromDatabase({ foo: "1.1", bar: "2.2" });

    expect(attributes.valuesBeforeTypeCast()).toEqual({ foo: "1.1", bar: "2.2" });
  });

  it("known columns are built with uninitialized attributes", () => {
    const attributes = attributesWithUninitializedKey();
    expect(attributes.getAttribute("foo").isInitialized()).toBeTruthy();
    expect(attributes.getAttribute("bar").isInitialized()).toBeFalsy();
  });

  it("uninitialized attributes are not included in the attributes hash", () => {
    const attributes = attributesWithUninitializedKey();
    expect(attributes.toHash()).toEqual({ foo: 1 });
  });

  it("uninitialized attributes are not included in keys", () => {
    const attributes = attributesWithUninitializedKey();
    expect(attributes.keys()).toEqual(["foo"]);
  });

  it("uninitialized attributes return false for key?", () => {
    const attributes = attributesWithUninitializedKey();
    expect(attributes.isKey("foo")).toBeTruthy();
    expect(attributes.isKey("bar")).toBeFalsy();
  });

  it("unknown attributes return false for key?", () => {
    const attributes = attributesWithUninitializedKey();
    expect(attributes.isKey("wibble")).toBeFalsy();
  });

  it("fetch_value returns the value for the given initialized attribute", () => {
    const builder = new Builder({ foo: new IntegerType(), bar: new FloatType() });
    const attributes = builder.buildFromDatabase({ foo: "1.1", bar: "2.2" });

    expect(attributes.fetchValue("foo")).toEqual(1);
    expect(attributes.fetchValue("bar")).toEqual(2.2);
  });

  it("fetch_value returns nil for unknown attributes", () => {
    const attributes = attributesWithUninitializedKey();
    assertNil(attributes.fetchValue("wibble", () => "hello"));
  });

  it("fetch_value returns nil for unknown attributes when types has a default", () => {
    const builder = new Builder({});
    const attributes = builder.buildFromDatabase();

    assertNil(attributes.fetchValue("wibble", () => "hello"));
  });

  it("fetch_value uses the given block for uninitialized attributes", () => {
    const attributes = attributesWithUninitializedKey();
    const value = attributes.fetchValue("bar", (n) => n + "!");
    expect(value).toEqual("bar!");
  });

  it("fetch_value returns nil for uninitialized attributes if no block is given", () => {
    const attributes = attributesWithUninitializedKey();
    expect(attributes.fetchValue("bar")).toBeUndefined();
  });

  it("the primary_key is always initialized", () => {
    const defaults = { foo: Attribute.fromUser("foo", null, null) };
    const builder = new Builder({ foo: new IntegerType() }, defaults);
    const attributes = builder.buildFromDatabase();

    expect(attributes.isKey("foo")).toBeTruthy();
    expect(attributes.keys()).toEqual(["foo"]);
    expect(attributes.getAttribute("foo").isInitialized()).toBeTruthy();
  });

  class MyType extends ValueType {
    override cast(value: unknown): string | null {
      if (value == null) return null;
      return `${String(value)} from user`;
    }

    override deserialize(value: unknown): string | null {
      if (value == null) return null;
      return `${String(value)} from database`;
    }

    override assertValidValue(): void {}
  }

  it("write_from_database sets the attribute with database typecasting", () => {
    const builder = new Builder({ foo: new MyType() });
    const attributes = builder.buildFromDatabase();

    expect(attributes.fetchValue("foo")).toBeUndefined();

    attributes.writeFromDatabase("foo", "value");

    expect(attributes.fetchValue("foo")).toEqual("value from database");
  });

  it("write_from_user sets the attribute with user typecasting", () => {
    const builder = new Builder({ foo: new MyType() });
    const attributes = builder.buildFromDatabase();

    expect(attributes.fetchValue("foo")).toBeUndefined();

    attributes.writeFromUser("foo", "value");

    expect(attributes.fetchValue("foo")).toEqual("value from user");
  });

  class MySerializedType extends ValueType {
    override serialize(value: unknown): unknown {
      return `${String(value)} serialized`;
    }
  }

  it("values_for_database", () => {
    const builder = new Builder({ foo: new MySerializedType() });
    const attributes = builder.buildFromDatabase();

    attributes.writeFromUser("foo", "value");

    expect(attributes.valuesForDatabase()).toEqual({ foo: "value serialized" });
  });

  it("freezing doesn't prevent the set from materializing", () => {
    const builder = new Builder({ foo: new StringType() });
    const attributes = builder.buildFromDatabase({ foo: "1" });

    attributes.freeze();
    expect(attributes.toHash()).toEqual({ foo: "1" });
  });

  it("marshalling dump/load materialized attribute hash", () => {
    const builder = new Builder({ foo: new StringType() });
    const attributes = builder.buildFromDatabase({ foo: "1" });

    const data = JSON.stringify(attributes.toHash());
    expect(JSON.parse(data)).toEqual({ foo: "1" });
  });

  it("#accessed_attributes returns only attributes which have been read", () => {
    const builder = new Builder({ foo: new ValueType(), bar: new ValueType() });
    const attributes = builder.buildFromDatabase({ foo: "1", bar: "2" });

    expect(attributes.accessed()).toEqual([]);

    attributes.fetchValue("foo");

    expect(attributes.accessed()).toEqual(["foo"]);
  });

  it("#map returns a new attribute set with the changes applied", () => {
    const builder = new Builder({ foo: new IntegerType(), bar: new IntegerType() });
    const attributes = builder.buildFromDatabase({ foo: "1", bar: "2" });
    const newAttributes = attributes.map((attr) => attr.withCastValue((attr.value as number) + 1));

    expect(newAttributes.fetchValue("foo")).toEqual(2);
    expect(newAttributes.fetchValue("bar")).toEqual(3);
  });

  it("comparison for equality is correctly implemented", () => {
    const builder = new Builder({ foo: new IntegerType(), bar: new IntegerType() });
    const attributes = builder.buildFromDatabase({ foo: "1", bar: "2" });
    const attributes2 = builder.buildFromDatabase({ foo: "1", bar: "2" });
    const attributes3 = builder.buildFromDatabase({ foo: "2", bar: "2" });
    const attributes4 = attributes.deepDup();

    expect(attributes.equals(attributes2)).toEqual(true);
    expect(attributes2.equals(attributes3)).not.toEqual(true);
    expect(attributes.equals(attributes4)).toEqual(true);
    expect(attributes4.equals(attributes)).toEqual(true);
  });

  it("==(other) is safe to use with any instance", () => {
    const attributeSet = new AttributeSet({});

    expect(attributeSet.equals(null)).toEqual(false);
    expect(attributeSet.equals(1)).toEqual(false);
    expect(attributeSet.equals(attributeSet)).toEqual(true);
  });

  function attributesWithUninitializedKey(): AttributeSet {
    const builder = new Builder({ foo: new IntegerType(), bar: new FloatType() });
    return builder.buildFromDatabase({ foo: "1.1" });
  }
});
