import { describe, it, expect } from "vitest";
import { Array as OidArray, Data as ArrayData } from "./array.js";
import { StringType } from "@blazetrails/activemodel";

describe("PostgreSQL array literal encoding", () => {
  const encoder = new OidArray(new StringType());
  const encode = (values: unknown[]): string => new ArrayData(encoder, values).toString();

  it("emits unambiguous elements bare", () => {
    expect(encode(["a", "b"])).toBe("{a,b}");
  });

  it("emits booleans unquoted", () => {
    expect(encode([true, false])).toBe("{true,false}");
  });

  it("recurses into nested arrays", () => {
    expect(encode([["a"], ["b", "c"]])).toBe("{{a},{b,c}}");
  });

  it("emits nil as the bare NULL token", () => {
    expect(encode([null])).toBe("{NULL}");
  });

  it("quotes the NULL string case-insensitively", () => {
    expect(encode(["NULL", "null"])).toBe('{"NULL","null"}');
  });

  it("quotes empty strings", () => {
    expect(encode([""])).toBe('{""}');
  });

  it("quotes delimiter-bearing content", () => {
    expect(encode(["a,b"])).toBe('{"a,b"}');
  });

  it("quotes whitespace content", () => {
    expect(encode(["a b", "a\tb"])).toBe('{"a b","a\tb"}');
  });

  it("escapes quotes and backslashes", () => {
    expect(encode(['he said "hi"', "a\\b"])).toBe('{"he said \\"hi\\"","a\\\\b"}');
  });

  it("quotes braces", () => {
    expect(encode(["{a}"])).toBe('{"{a}"}');
  });

  it("leaves non-ASCII whitespace bare", () => {
    expect(encode(["a\u00a0b"])).toBe("{a\u00a0b}");
  });
});
