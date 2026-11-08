import { describe, it, expect } from "vitest";
import { assertSame } from "@blazetrails/activesupport";
import { ImmutableStringType } from "./immutable-string.js";

describe("ImmutableStringTest", () => {
  it("cast strings are frozen", () => {
    const s = "foo";
    const type = new ImmutableStringType();
    expect(Object.isFrozen(type.cast(s))).toEqual(true);
  });

  it("immutable strings are not duped coming out", () => {
    const s = "foo";
    const type = new ImmutableStringType();
    assertSame(s, type.cast(s));
    assertSame(s, type.deserialize(s));
  });
});
