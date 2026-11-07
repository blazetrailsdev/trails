import { describe, it, expect } from "vitest";
import { SpellChecker } from "./spell-checker.js";

function correct(input: string, dictionary: ReadonlyArray<string>): string[] {
  return new SpellChecker({ dictionary }).correct(input);
}

describe("SpellChecker", () => {
  it("returns nearest dictionary entries by Jaro-Winkler / Levenshtein", () => {
    expect(correct("foo", ["fooo", "fobr", "qux"])).toEqual(["fooo"]);
  });

  it("uses the looser 0.77 threshold for short (≤3 codepoint) inputs", () => {
    expect(correct("fo", ["foo"])).toEqual(["foo"]);
  });

  it("uses the stricter 0.834 threshold for longer inputs", () => {
    expect(correct("xyz", ["foo", "bar", "baz"])).toEqual([]);
  });

  it("is case-insensitive via normalize() but preserves dictionary casing", () => {
    expect(correct("FOO", ["foo"])).toEqual(["foo"]);
    expect(correct("FOO", ["Foo", "foo", "FOOO"])).toEqual(["foo", "Foo", "FOOO"]);
  });

  it("strips '@' from input during normalization", () => {
    expect(correct("@foo", ["foo"])).toEqual(["foo"]);
  });

  it("rejects exact-equality dictionary matches (step 5)", () => {
    expect(correct("foo", ["foo"])).toEqual([]);
  });

  it("returns [] for empty input or empty dictionary", () => {
    expect(correct("", ["foo"])).toEqual([]);
    expect(correct("foo", [])).toEqual([]);
  });

  it("orders results by Jaro-Winkler score, descending, stable on ties", () => {
    expect(correct("recieve", ["receive", "retrieve", "relieve"])).toEqual([
      "receive",
      "relieve",
      "retrieve",
    ]);
  });

  it("falls through to the misspell fallback when Levenshtein filters all mistype candidates", () => {
    expect(correct("abcd", ["abdc"])).toEqual(["abdc"]);
  });

  it("uses codepoint length (not UTF-16) when picking the JW threshold", () => {
    expect(correct("🎉ab", ["🎉ac"])).toEqual(["🎉ac"]);
  });

  it("handles Rails-style action-name dictionaries", () => {
    expect(correct("shwo", ["show", "index", "edit", "update", "destroy"])).toEqual(["show"]);
  });

  it("handles Rails-style strong-params key dictionaries", () => {
    expect(correct("created_t", ["created_at", "updated_at", "id"])).toEqual(["created_at"]);
  });

  it("handles underscored Ruby-method-style entries", () => {
    expect(correct("__send", ["__send__", "send"])).toEqual(["__send__", "send"]);
  });
});
