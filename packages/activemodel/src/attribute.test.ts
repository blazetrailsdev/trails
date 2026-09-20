import { describe, it, expect, beforeEach } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { Attribute } from "./attribute.js";
import { AttributeSet } from "./attribute-set.js";
import { ValueType } from "./type/value.js";
import { FloatType } from "./type/float.js";
import { IntegerType } from "./type/integer.js";
import { StringType } from "./type/string.js";

describe("AttributeTest", () => {
  class InscribingType extends ValueType {
    override isChangedInPlace(_rawOldValue: unknown, _newValue: unknown): boolean {
      return false;
    }

    override cast(value: unknown): string {
      return `cast(${String(value)})`;
    }

    override serialize(value: unknown): string {
      return `serialize(${String(value)})`;
    }

    override deserialize(value: unknown): string {
      return `deserialize(${String(value)})`;
    }
  }

  let type: ValueType;

  beforeEach(() => {
    type = new InscribingType();
  });

  it("from_database + read type casts from database", () => {
    const attribute = Attribute.fromDatabase(null!, "a value", type);

    expect(attribute.value).toEqual("deserialize(a value)");
  });

  it("from_user + read type casts from user", () => {
    const attribute = Attribute.fromUser(null!, "a value", type);

    expect(attribute.value).toEqual("cast(a value)");
  });

  it("reading memoizes the value", () => {
    let count = 0;
    type.deserialize = (value: unknown): unknown => {
      count += 1;
      return value;
    };

    const attribute = Attribute.fromDatabase(null!, "whatever", type);

    void attribute.value;
    void attribute.value;
    expect(count).toEqual(1);
  });

  it("reading memoizes falsy values", () => {
    let count = 0;
    type.deserialize = (_value: unknown): unknown => {
      count += 1;
      return false;
    };

    const attribute = Attribute.fromDatabase(null!, "whatever", type);

    void attribute.value;
    void attribute.value;
    expect(count).toEqual(1);
  });

  it("value_before_type_cast returns the given value", () => {
    const attribute = Attribute.fromDatabase(null!, "raw value", type);

    const rawValue = attribute.valueBeforeTypeCast;

    expect(rawValue).toEqual("raw value");
  });

  it("from_database + value_for_database type casts to and from database", () => {
    const attribute = Attribute.fromDatabase(null!, "whatever", type);

    expect(attribute.valueForDatabase).toEqual("serialize(deserialize(whatever))");
  });

  it("from_user + value_for_database type casts from the user to the database", () => {
    const attribute = Attribute.fromUser(null!, "whatever", type);

    expect(attribute.valueForDatabase).toEqual("serialize(cast(whatever))");
  });

  it("from_user + value_for_database uses serialize_cast_value when possible", () => {
    type = new (class extends InscribingType {
      override serializeCastValue(value: unknown): string {
        return `serialize_cast_value(${String(value)})`;
      }
    })();

    const attribute = Attribute.fromUser(null!, "whatever", type);

    expect(attribute.valueForDatabase).toEqual("serialize_cast_value(cast(whatever))");
  });

  it("value_for_database is memoized", () => {
    let count = 0;
    type.serialize = (_value: unknown): unknown => {
      count += 1;
      return null;
    };

    const attribute = Attribute.fromUser(null!, "whatever", type);

    void attribute.valueForDatabase;
    void attribute.valueForDatabase;
    expect(count).toEqual(1);
  });

  it("value_for_database is recomputed when value changes in place", () => {
    let count = 0;
    type.serialize = (_value: unknown): unknown => {
      count += 1;
      return null;
    };
    type.isChangedInPlace = (): boolean => true;

    const attribute = Attribute.fromUser(null!, "whatever", type);

    void attribute.valueForDatabase;
    void attribute.valueForDatabase;
    expect(count).toEqual(2);
  });

  // BLOCKED: assertions-immutable-js-string-values
  it.skip("duping dups the value", () => {
    const attribute = Attribute.fromDatabase(null!, "a value", type);

    expect(attribute.value).not.toBe(attribute.dup().value);
  });

  it("duping does not dup the value if it is not dupable", () => {
    type.deserialize = (value: unknown): unknown => value;
    const attribute = Attribute.fromDatabase(null!, false, type);

    expect(attribute.value).toBe(attribute.dup().value);
  });

  it("duping does not eagerly type cast if we have not yet type cast", () => {
    let deserializeCalled = false;
    let deserializeCalledWith: unknown = null;
    type.deserialize = (value: unknown): unknown => {
      deserializeCalledWith = value;
      return (deserializeCalled = true);
    };
    const attribute = Attribute.fromDatabase(null!, "my_attribute_value", type);

    attribute.dup();
    expect(deserializeCalled).toBeFalsy();
    void deserializeCalledWith;
  });

  class MyType extends ValueType {
    override cast(value: unknown): string {
      return `${String(value)} from user`;
    }

    override deserialize(value: unknown): string {
      return `${String(value)} from database`;
    }

    override assertValidValue(): void {}
  }

  it("with_value_from_user returns a new attribute with the value from the user", () => {
    const old = Attribute.fromDatabase(null!, "old", new MyType());
    const newAttribute = old.withValueFromUser("new");

    expect(old.value).toEqual("old from database");
    expect(newAttribute.value).toEqual("new from user");
  });

  it("with_value_from_database returns a new attribute with the value from the database", () => {
    const old = Attribute.fromUser(null!, "old", new MyType());
    const newAttribute = old.withValueFromDatabase("new");

    expect(old.value).toEqual("old from user");
    expect(newAttribute.value).toEqual("new from database");
  });

  it("uninitialized attributes yield their name if a block is given to value", () => {
    const block = (name: string): string => name + "!";
    const foo = Attribute.uninitialized("foo", null);
    const bar = Attribute.uninitialized("bar", null);

    expect(new AttributeSet({ foo }).fetchValue("foo", block)).toEqual("foo!");
    expect(new AttributeSet({ bar }).fetchValue("bar", block)).toEqual("bar!");
  });

  it("uninitialized attributes have no value", () => {
    expect(Attribute.uninitialized("foo", null).value).toBeUndefined();
  });

  it("attributes equal other attributes with the same constructor arguments", () => {
    const first = Attribute.fromDatabase("foo", 1, new IntegerType());
    const second = Attribute.fromDatabase("foo", 1, new IntegerType());
    expect(first.equals(second)).toEqual(true);
  });

  it("attributes do not equal attributes with different names", () => {
    const first = Attribute.fromDatabase("foo", 1, new IntegerType());
    const second = Attribute.fromDatabase("bar", 1, new IntegerType());
    expect(first.equals(second)).not.toEqual(true);
  });

  it("attributes do not equal attributes with different types", () => {
    const first = Attribute.fromDatabase("foo", 1, new IntegerType());
    const second = Attribute.fromDatabase("foo", 1, new FloatType());
    expect(first.equals(second)).not.toEqual(true);
  });

  it("attributes do not equal attributes with different values", () => {
    const first = Attribute.fromDatabase("foo", 1, new IntegerType());
    const second = Attribute.fromDatabase("foo", 2, new IntegerType());
    expect(first.equals(second)).not.toEqual(true);
  });

  it("attributes do not equal attributes of other classes", () => {
    const first = Attribute.fromDatabase("foo", 1, new IntegerType());
    const second = Attribute.fromUser("foo", 1, new IntegerType());
    expect(first.equals(second)).not.toEqual(true);
  });

  it("an attribute has not been read by default", () => {
    const attribute = Attribute.fromDatabase("foo", 1, new ValueType());
    expect(attribute.hasBeenRead()).toBeFalsy();
  });

  it("an attribute has been read when its value is calculated", () => {
    const attribute = Attribute.fromDatabase("foo", 1, new ValueType());
    void attribute.value;
    expect(attribute.hasBeenRead()).toBeTruthy();
  });

  it("an attribute is not changed if it hasn't been assigned or mutated", () => {
    const attribute = Attribute.fromDatabase("foo", 1, new ValueType());

    expect(attribute.isChanged()).toBeFalsy();
  });

  it("an attribute is changed if it's been assigned a new value", () => {
    const attribute = Attribute.fromDatabase("foo", 1, new ValueType());
    const changed = attribute.withValueFromUser(2);

    expect(changed.isChanged()).toBeTruthy();
  });

  it("an attribute is not changed if it's assigned the same value", () => {
    const attribute = Attribute.fromDatabase("foo", 1, new ValueType());
    const unchanged = attribute.withValueFromUser(1);

    expect(unchanged.isChanged()).toBeFalsy();
  });

  it("an attribute cannot be mutated if it has not been read, and skips expensive calculations", () => {
    const typeWhichRaisesFromAllMethods = {} as unknown as ValueType;
    const attribute = Attribute.fromDatabase("foo", "bar", typeWhichRaisesFromAllMethods);

    expect(attribute.changedInPlace()).toBeFalsy();
  });

  // BLOCKED: assertions-immutable-js-string-values
  it.skip("an attribute is changed if it has been mutated", () => {
    const attribute = Attribute.fromDatabase("foo", "bar", new StringType());
    (attribute.value as string[]).push("!");

    expect(attribute.changedInPlace()).toBeTruthy();
    expect(attribute.isChanged()).toBeTruthy();
  });

  it("an attribute can forget its changes", () => {
    const attribute = Attribute.fromDatabase("foo", "bar", new StringType());
    const changed = attribute.withValueFromUser("foo");
    const forgotten = changed.forgettingAssignment();

    expect(changed.isChanged()).toBeTruthy();
    expect(forgotten.isChanged()).toBeFalsy();
  });

  // BLOCKED: attribute-from-database-forgetting-assignment-returns-self
  it.skip("#forgetting_assignment on an unchanged .from_database attribute re-deserializes its value", () => {
    class deserializedValueClass {
      id: unknown;
      constructor(id: unknown) {
        this.id = id;
      }
      initializeDup(): void {
        this.id = null;
      }
    }

    const type = new ValueType();
    type.deserialize = (value: unknown): unknown => new deserializedValueClass(value);

    const original = Attribute.fromDatabase("foo", 123, type);
    expect((original.value as deserializedValueClass).id).toEqual(123);

    const forgotten = original.forgettingAssignment();
    expect((forgotten.value as deserializedValueClass).id).toEqual(123);

    expect(original.value).not.toBe(forgotten.value);
  });

  it("with_value_from_user validates the value", () => {
    const type = new ValueType();
    type.assertValidValue = (value: unknown): void => {
      if (value === 1) {
        throw new ArgumentError();
      }
    };

    const attribute = Attribute.fromDatabase("foo", 1, type);
    expect(attribute.value).toEqual(1);
    expect(attribute.withValueFromUser(2).value).toEqual(2);
    expect(() => {
      attribute.withValueFromUser(1);
    }).toThrow(ArgumentError);
  });

  // BLOCKED: assertions-immutable-js-string-values
  it.skip("with_type preserves mutations", () => {
    const attribute = Attribute.fromDatabase("foo", "", new ValueType());
    (attribute.value as string[]).push("1");

    expect(attribute.withType(new IntegerType()).value).toEqual(1);
  });
});
