import { describe, it, expect } from "vitest";
import { Array as OidArray, Data as ArrayData } from "./array.js";
import { StringType } from "@blazetrails/activemodel";

// trails-only: `encode` stands in for `PG::TextEncoder::Array`, the ruby-pg C
// extension Rails hands the array to (`oid/array.rb:19`), so there is no Rails
// test to mirror. This file was `array-encode-parity.trails.test.ts`, which
// pinned `encode` against arel's duplicate copy of the same rule (it drifted
// three times: #4867, #4869, #4872). The copy is gone — the adapter is now the
// only array-encoding path — so the same cases pin the encoder's bytes
// directly instead of comparing two implementations.
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

  // pg tests bytes with `isspace()`, which is ASCII-only — a `/\s/` test would
  // over-quote a NBSP (the live drift #4872 removed).
  it("leaves non-ASCII whitespace bare", () => {
    expect(encode(["a\u00a0b"])).toBe("{a\u00a0b}");
  });
});
