import { describe, it, expect } from "vitest";
import { assertPredicate } from "@blazetrails/activesupport";
import { Types } from "../index.js";

describe("BooleanTest", () => {
  it("type cast boolean", () => {
    const type = new Types.BooleanType();
    assertPredicate(type.cast(""), (v) => v === null);
    assertPredicate(type.cast(null), (v) => v === null);

    expect(type.cast(true)).toBeTruthy();
    expect(type.cast(1)).toBeTruthy();
    expect(type.cast("1")).toBeTruthy();
    expect(type.cast("t")).toBeTruthy();
    expect(type.cast("T")).toBeTruthy();
    expect(type.cast("true")).toBeTruthy();
    expect(type.cast("TRUE")).toBeTruthy();
    expect(type.cast("on")).toBeTruthy();
    expect(type.cast("ON")).toBeTruthy();
    expect(type.cast(" ")).toBeTruthy();
    expect(type.cast("　\r\n")).toBeTruthy();
    expect(type.cast("\u0000")).toBeTruthy();
    expect(type.cast("SOMETHING RANDOM")).toBeTruthy();
    // Rails' Symbol arm: `:"1"`, `:t`, … A Ruby Symbol is a JS string, and
    // FALSE_VALUES holds both spellings (type/boolean.rb:15-24), so the Symbol
    // rows repeat the String rows above rather than adding a distinct kind.
    expect(type.cast(":1")).toBeTruthy();
    expect(type.cast(":t")).toBeTruthy();
    expect(type.cast(":T")).toBeTruthy();
    expect(type.cast(":true")).toBeTruthy();
    expect(type.cast(":TRUE")).toBeTruthy();
    expect(type.cast(":on")).toBeTruthy();
    expect(type.cast(":ON")).toBeTruthy();

    // explicitly check for false vs nil
    expect(type.cast(false)).toEqual(false);
    expect(type.cast(0)).toEqual(false);
    expect(type.cast("0")).toEqual(false);
    expect(type.cast("f")).toEqual(false);
    expect(type.cast("F")).toEqual(false);
    expect(type.cast("false")).toEqual(false);
    expect(type.cast("FALSE")).toEqual(false);
    expect(type.cast("off")).toEqual(false);
    expect(type.cast("OFF")).toEqual(false);
    expect(type.cast(":0")).toEqual(false);
    expect(type.cast(":f")).toEqual(false);
    expect(type.cast(":F")).toEqual(false);
    expect(type.cast(":false")).toEqual(false);
    expect(type.cast(":FALSE")).toEqual(false);
    expect(type.cast(":off")).toEqual(false);
    expect(type.cast(":OFF")).toEqual(false);
  });
});
