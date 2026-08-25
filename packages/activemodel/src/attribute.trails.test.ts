import { describe, it, expect } from "vitest";
import { Attribute, FromUser, UNINITIALIZED_ORIGINAL_VALUE } from "./attribute.js";
import { UNINITIALIZED_ORIGINAL_VALUE as UNINITIALIZED_FROM_INDEX } from "./index.js";
import { typeRegistry } from "./type/registry.js";
import "./attribute/user-provided-default.js";

describe("Attribute — trails-only coverage", () => {
  it("#serializable? delegates to the type", () => {
    const attr = Attribute.fromDatabase("count", 42, typeRegistry.lookup("integer"));
    expect(attr.isSerializable()).toBe(true);
  });

  it("#type_cast delegates to the subclass implementation", () => {
    const fromDb = Attribute.fromDatabase("name", "Alice", typeRegistry.lookup("string"));
    expect(fromDb.typeCast("Bob")).toBe("Bob");

    const fromUser = Attribute.fromUser("age", "42", typeRegistry.lookup("integer"));
    expect(fromUser.typeCast("99")).toBe(99);
  });

  it("#original_value_for_database returns the original serialized value", () => {
    const original = Attribute.fromDatabase("name", "Alice", typeRegistry.lookup("string"));
    const changed = original.withValueFromUser("Bob");
    expect(changed.originalValueForDatabase()).toBe("Alice");
  });

  it("#with_user_default creates a UserProvidedDefault attribute", () => {
    const attr = Attribute.fromDatabase("name", null, typeRegistry.lookup("string"));
    const withDefault = attr.withUserDefault("fallback");
    expect(withDefault.value).toBe("fallback");
  });

  it("from_user came_from_user? checks value_constructed_by_mass_assignment", () => {
    const stringType = typeRegistry.lookup("string");
    const attr = Attribute.fromUser("name", "hello", stringType);
    expect(attr.cameFromUser()).toBe(true);
  });

  it("from_user came_from_user? returns false when type says value constructed by mass assignment", () => {
    const customType = Object.create(typeRegistry.lookup("string"));
    customType.isValueConstructedByMassAssignment = () => true;
    const attr = Attribute.fromUser("data", '{"key":"val"}', customType);
    expect(attr.cameFromUser()).toBe(false);
  });

  it("from_user came_from_user? passes valueBeforeTypeCast to type, not cast value", () => {
    let receivedValue: unknown;
    const intType = Object.create(typeRegistry.lookup("integer"));
    intType.isValueConstructedByMassAssignment = (v: unknown) => {
      receivedValue = v;
      return false;
    };
    const attr = Attribute.fromUser("age", "42", intType);
    attr.cameFromUser();
    expect(receivedValue).toBe("42");
    expect(attr.value).toBe(42);
  });

  it("from_database came_from_user? returns false", () => {
    const attr = Attribute.fromDatabase("name", "hello", typeRegistry.lookup("string"));
    expect(attr.cameFromUser()).toBe(false);
  });

  it("with_type preserves in-place mutations via with_value_from_user chain", () => {
    const stringType = typeRegistry.lookup("string");
    const otherType = typeRegistry.lookup("string");
    class MutableFromUser extends FromUser {
      override changedInPlace(): boolean {
        return true;
      }
    }
    const attr = new MutableFromUser("tags", ["a"], stringType, null, ["a", "b"]);
    const retyped = attr.withType(otherType);
    expect(retyped.valueBeforeTypeCast).toEqual(["a", "b"]);
    expect(retyped.type).toBe(otherType);
  });

  it("with_type preserves originalAttribute when not changed in place", () => {
    const stringType = typeRegistry.lookup("string");
    const otherType = typeRegistry.lookup("string");
    const original = Attribute.fromDatabase("name", "old", stringType);
    const changed = original.withValueFromUser("new");
    const retyped = changed.withType(otherType);
    expect(retyped.getOriginalAttribute()).toBe(original);
    expect(retyped.type).toBe(otherType);
    expect(retyped.valueBeforeTypeCast).toBe("new");
  });

  it("with_value_from_user calls assert_valid_value before constructing", () => {
    const intType = Object.create(typeRegistry.lookup("integer"));
    intType.assertValidValue = (v: unknown) => {
      if (typeof v === "number" && (v < 0 || v > 100)) {
        throw new RangeError("out of range");
      }
    };
    const attr = Attribute.fromUser("score", 50, intType);
    expect(() => attr.withValueFromUser(200)).toThrow("out of range");
    expect(() => attr.withValueFromUser(75)).not.toThrow();
  });

  it("Uninitialized#originalValue returns the UNINITIALIZED_ORIGINAL_VALUE sentinel", () => {
    const u = Attribute.uninitialized("name", typeRegistry.lookup("string"));
    expect(u.originalValue).toBe(UNINITIALIZED_ORIGINAL_VALUE);
  });

  it("with_type on UserProvidedDefault preserves proc defaults unevaluated", async () => {
    const { UserProvidedDefault } = await import("./attribute/user-provided-default.js");
    const stringType = typeRegistry.lookup("string");
    const otherType = typeRegistry.lookup("string");
    let calls = 0;
    const proc = () => {
      calls++;
      return `value-${calls}`;
    };
    const upd = new UserProvidedDefault("name", proc, stringType, null);
    const retyped = upd.withType(otherType) as InstanceType<typeof UserProvidedDefault>;
    expect(retyped).toBeInstanceOf(UserProvidedDefault);
    expect(retyped.userProvidedValue).toBe(proc);
    expect(calls).toBe(0);
    expect(retyped.valueBeforeTypeCast).toBe("value-1");
    expect(calls).toBe(1);
  });

  it("UNINITIALIZED_ORIGINAL_VALUE is a singleton across import paths", () => {
    expect(UNINITIALIZED_ORIGINAL_VALUE).toBe(UNINITIALIZED_FROM_INDEX);
  });

  describe("isChanged delegates to type.isChanged — numeric type integration", () => {
    it("integer attribute changed from 10 to '5' (casts to 5) reports isChanged true", () => {
      const intType = typeRegistry.lookup("integer");
      const original = Attribute.fromDatabase("score", 10, intType);
      const updated = original.withValueFromUser("5");
      expect(updated.isChanged()).toBe(true);
    });

    it("integer attribute changed from 10 to 'abc' (non-numeric raw, casts to null) reports isChanged true via number_to_non_number?", () => {
      const intType = typeRegistry.lookup("integer");
      const original = Attribute.fromDatabase("score", 10, intType);
      const updated = original.withValueFromUser("abc");
      expect(updated.isChanged()).toBe(true);
    });

    it("float attribute NaN-to-NaN reports isChanged false — equal_nan? exemption", () => {
      const floatType = typeRegistry.lookup("float");
      const original = Attribute.fromDatabase("ratio", NaN, floatType);
      const updated = original.withValueFromUser(NaN);
      expect(updated.isChanged()).toBe(false);
    });
  });

  describe("Attribute#changedInPlace delegates to type.isChangedInPlace", () => {
    it("returns true when type.isChangedInPlace returns true (StringType: raw vs new value differ)", () => {
      const stringType = typeRegistry.lookup("string");
      const attr = Attribute.fromDatabase("name", "hello", stringType);
      void attr.value;
      attr.overrideCastValue("world");
      expect(attr.changedInPlace()).toBe(true);
    });

    it("returns false before value is read (hasBeenRead guard)", () => {
      const stringType = typeRegistry.lookup("string");
      const attr = Attribute.fromDatabase("name", "hello", stringType);
      expect(attr.changedInPlace()).toBe(false);
    });

    it("returns false for immutable type even after value is read", () => {
      const intType = typeRegistry.lookup("integer");
      const attr = Attribute.fromDatabase("count", 5, intType);
      void attr.value;
      expect(attr.changedInPlace()).toBe(false);
    });
  });

  describe("valueForDatabase cache invalidation uses type.isChangedInPlace", () => {
    it("stays memoized when isChangedInPlace returns false (immutable type)", () => {
      const stringType = typeRegistry.lookup("string");
      let serializeCount = 0;
      const spyType = Object.create(stringType);
      spyType.serialize = (v: unknown) => {
        serializeCount++;
        return stringType.serialize(v);
      };
      const attr = Attribute.fromDatabase("name", "hello", spyType);
      void attr.valueForDatabase;
      void attr.valueForDatabase;
      expect(serializeCount).toBe(1);
    });

    it("recomputes when in-place object mutation is detected via isChangedInPlace", () => {
      const Types = typeRegistry;
      const baseType = Types.lookup("value");
      const mutableType = Object.create(baseType);
      mutableType.deserialize = (v: unknown) =>
        typeof v === "string" ? JSON.parse(v) : (v ?? null);
      mutableType.serialize = (v: unknown) => (v == null ? null : JSON.stringify(v));
      mutableType.isChangedInPlace = (rawOld: unknown, newVal: unknown) =>
        JSON.stringify(typeof rawOld === "string" ? JSON.parse(rawOld) : rawOld) !==
        JSON.stringify(newVal);

      const attr = Attribute.fromDatabase("data", '{"x":1}', mutableType);
      void attr.valueForDatabase;
      (attr.value as Record<string, number>).x = 99;
      expect(attr.valueForDatabase).toBe('{"x":99}');
    });
  });
  describe("#deepDup", () => {
    it("shares originalAttribute by reference, as Attribute#initialize_dup does", () => {
      const type = typeRegistry.lookup("string");
      const original = Attribute.fromDatabase("name", "Alice", type);
      const assigned = original.withValueFromUser("Bob");

      const duped = assigned.deepDup();

      expect(duped).not.toBe(assigned);
      expect(duped.getOriginalAttribute()).toBe(assigned.getOriginalAttribute());
      expect(duped.originalValue).toBe("Alice");
      expect(duped.isChanged()).toBe(true);
    });

    it("dups the memoized cast value so an in-place mutation does not bleed back", () => {
      const type = Object.create(typeRegistry.lookup("value")) as {
        deserialize(v: unknown): unknown;
      };
      type.deserialize = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);

      const attr = Attribute.fromDatabase("data", '["a"]', type as never);
      void attr.value;
      const duped = attr.deepDup();
      (duped.value as string[]).push("b");

      expect(attr.value).toEqual(["a"]);
      expect(duped.value).toEqual(["a", "b"]);
    });
  });
});
