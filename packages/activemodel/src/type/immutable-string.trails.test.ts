import { describe, it, expect } from "vitest";
import { Duration } from "@blazetrails/activesupport";
import { Types } from "../index.js";
import { ImmutableStringType } from "./immutable-string.js";

describe("ImmutableStringType (trails)", () => {
  it("serialize sends a Numeric and a Duration to to_s, and passes other objects through", () => {
    const type = new ImmutableStringType();
    const object = {},
      array = [true];
    expect(type.serialize(123)).toBe("123");
    expect(type.serialize(Duration.seconds(5))).toBe(String(Duration.seconds(5)));
    expect(type.serialize(object)).toBe(object);
    expect(type.serialize(array)).toBe(array);
  });

  it("serialize leaves a String alone, leading colon and all", () => {
    const type = new ImmutableStringType();
    expect(type.serialize("::Alpha")).toBe("::Alpha");
    expect(type.serialize(":bob")).toBe(":bob");
    expect(type.serialize("bob")).toBe("bob");
  });

  it("serialize maps booleans to the configured true/false strings", () => {
    const type = new ImmutableStringType({ true: "aye", false: "nay" });
    expect(type.serialize(true)).toBe("aye");
    expect(type.serialize(false)).toBe("nay");
  });
});

describe("ImmutableStringType casting", () => {
  it("casts booleans to the PG literal form", () => {
    const type = Types.typeRegistry.lookup("immutable_string");
    expect(type.cast(true)).toBe("t");
    expect(type.cast(false)).toBe("f");
  });
  it("custom true is returned for true", () => {
    const type = new ImmutableStringType({ true: "aye" });
    expect(type.cast(true)).toBe("aye");
  });

  it("custom false is returned for false", () => {
    const type = new ImmutableStringType({ false: "nay" });
    expect(type.cast(false)).toBe("nay");
  });

  it("custom true and false both work", () => {
    const type = new ImmutableStringType({ true: "aye", false: "nay" });
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
    const type = new ImmutableStringType({ true: "aye" });
    const cast = type.cast(true);
    expect(type.serialize(cast)).toBe("aye");
  });
});
