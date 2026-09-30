import { describe, it, expect } from "vitest";
import { stringInspect } from "./inspect.js";

describe("String#inspect", () => {
  it("inspects a String the way Ruby's String#inspect does", () => {
    expect(stringInspect("foo")).toBe('"foo"');
    expect(stringInspect('he said "hi"')).toBe('"he said \\"hi\\""');
    expect(stringInspect("a\\b")).toBe('"a\\\\b"');
    expect(stringInspect("a\x1b\tb")).toBe('"a\\e\\tb"');
    expect(stringInspect("\x07\b\v\f\r\n")).toBe('"\\a\\b\\v\\f\\r\\n"');
    expect(stringInspect("\x00\x1f\x7f\x85")).toBe('"\\u0000\\u001F\\u007F\\u0085"');
    expect(stringInspect("#{x}")).toBe('"\\#{x}"');
    expect(stringInspect("a#$g")).toBe('"a\\#$g"');
    expect(stringInspect("a#@g")).toBe('"a\\#@g"');
    expect(stringInspect("a#b")).toBe('"a#b"');
    expect(stringInspect("café 😀")).toBe('"café 😀"');
    expect(stringInspect("a\ud800b")).toBe('"a\\xED\\xA0\\x80b"');
  });

  it("inspects a non-printable code point the way Ruby's String#inspect does", () => {
    expect(stringInspect("͸")).toBe('"\\u0378"');
    expect(stringInspect("퟿")).toBe('"\\uD7FF"');
    expect(stringInspect("￾")).toBe('"\\uFFFE"');
    expect(stringInspect("  ")).toBe('"\\u2028\\u2029"');
    expect(stringInspect("\u{10ffff}")).toBe('"\\u{10FFFF}"');
    expect(stringInspect("​")).toBe('"​"');
    expect(stringInspect("­")).toBe('"­"');
    expect(stringInspect("")).toBe('""');
    expect(stringInspect(" ᠎")).toBe('" ᠎"');
  });
});
