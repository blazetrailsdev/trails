import { describe, it, expect } from "vitest";
import { Types } from "../index.js";
import { assertSame } from "@blazetrails/activesupport";
import { ImmutableStringType } from "./immutable-string.js";

describe("ImmutableStringTest", () => {
  it("cast strings are frozen", () => {
    const s = "foo";
    const type = new ImmutableStringType();
    expect(Object.isFrozen(type.cast(s))).toEqual(true);
  });

  it("casts booleans to the PG literal form", () => {
    // Rails type/immutable_string.rb#cast_value:
    //   case value when true then @true; when false then @false; else value.to_s.freeze
    const type = Types.typeRegistry.lookup("immutable_string");
    expect(type.cast(true)).toBe("t");
    expect(type.cast(false)).toBe("f");
  });

  it("immutable strings are not duped coming out", () => {
    const s = "foo";
    const type = new ImmutableStringType();
    assertSame(s, type.cast(s));
    assertSame(s, type.deserialize(s));
  });

  it("custom trueString is returned for true", () => {
    const type = new ImmutableStringType({ trueString: "aye" });
    expect(type.cast(true)).toBe("aye");
  });

  it("custom falseString is returned for false", () => {
    const type = new ImmutableStringType({ falseString: "nay" });
    expect(type.cast(false)).toBe("nay");
  });

  it("custom trueString and falseString both work", () => {
    const type = new ImmutableStringType({ trueString: "aye", falseString: "nay" });
    expect(type.cast(true)).toBe("aye");
    expect(type.cast(false)).toBe("nay");
  });

  it("defaults to t/f when no custom strings provided", () => {
    const type = new ImmutableStringType();
    expect(type.cast(true)).toBe("t");
    expect(type.cast(false)).toBe("f");
  });

  it("type() returns string", () => {
    const type = new ImmutableStringType();
    expect(type.type()).toBe("string");
  });

  it("name stays immutable_string", () => {
    const type = new ImmutableStringType();
    expect(type.name).toBe("immutable_string");
  });

  it("cast then serialize of custom-true value preserves the string", () => {
    const type = new ImmutableStringType({ trueString: "aye" });
    const cast = type.cast(true);
    expect(type.serialize(cast)).toBe("aye");
  });
});
