import { describe, expect, it } from "vitest";
import { ArgumentError, NoMethodError, Range } from "@blazetrails/ruby-compat";
import { Argument } from "./argument.js";

describe("Thor::Argument", () => {
  it("names itself after the Ruby class, not the JS one", () => {
    const name = Object.getOwnPropertyDescriptor(Argument, "name")!;
    Object.defineProperty(Argument, "name", { ...name, value: "q" });
    try {
      expect(() => new Argument(null)).toThrow(new ArgumentError("Argument name can't be nil."));
    } finally {
      Object.defineProperty(Argument, "name", name);
    }
  });

  it("is required unless the options carry the key", () => {
    expect(new Argument("foo").required).toBe(true);
    expect(new Argument("foo", { required: null }).required).toBe(null);
    expect(new Argument("foo", { required: false }).usage()).toBe("[FOO]");
  });

  it("aliases human_name to name", () => {
    expect(new Argument("foo").humanName).toBe("foo");
  });

  it("refuses a required argument whose default is false", () => {
    expect(() => new Argument("foo", { default: false })).toThrow(
      new ArgumentError("An argument cannot be required and have default value."),
    );
  });

  it("shows a default unless it is an empty Array, String or Hash", () => {
    const showDefault = (default_: unknown) =>
      new Argument("foo", { required: false, default: default_ }).isShowDefault();
    expect(showDefault([])).toBe(false);
    expect(showDefault("")).toBe(false);
    expect(showDefault({})).toBe(false);
    expect(showDefault(["a"])).toBe(true);
    expect(showDefault(0)).toBe(0);
    expect(showDefault(null)).toBe(null);
  });

  it("prints an Array or Set enum joined and a Range enum as first..last", () => {
    expect(new Argument("foo", { enum: ["a", "b"] }).enumToS()).toBe("a, b");
    expect(new Argument("foo", { enum: new Set(["a", "b"]) }).enumToS()).toBe("a, b");
    expect(() => new Argument("foo", { enum: { a: 1 } }).enumToS()).toThrow(NoMethodError);
    expect(new Argument("foo", { type: "numeric", enum: new Range(1, 3) }).enumToS()).toBe("1..3");
  });
});
