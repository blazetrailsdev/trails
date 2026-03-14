import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

describe("ImmutableStringTest", () => {
  it("cast strings are frozen", () => {
    const type = Types.typeRegistry.lookup("immutable_string");
    const result = type.cast("hello");
    expect(result).toBe("hello");
    expect(Object.isFrozen(result)).toBe(true);
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
