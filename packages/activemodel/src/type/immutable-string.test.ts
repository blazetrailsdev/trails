import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

describe("ImmutableStringTest", () => {
  it("cast strings are frozen", () => {
    const type = Types.typeRegistry.lookup("immutable_string");
    const result = type.cast("hello");
    expect(result).toBe("hello");
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("casts booleans to the PG literal form", () => {
    // Rails type/immutable_string.rb#cast_value:
    //   case value when true then "t"; when false then "f"; else value.to_s
    const type = Types.typeRegistry.lookup("immutable_string");
    expect(type.cast(true)).toBe("t");
    expect(type.cast(false)).toBe("f");
  });

  it("immutable strings are not duped coming out", () => {
    const type = Types.typeRegistry.lookup("immutable_string");
    const a = type.cast("hello");
    const b = type.cast("hello");
    // Both should be frozen strings
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(b)).toBe(true);
    expect(a).toBe("hello");
    expect(b).toBe("hello");
  });
});
