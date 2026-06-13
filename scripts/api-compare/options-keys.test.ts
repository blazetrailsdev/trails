import { describe, it, expect } from "vitest";
import { normalizeRubyKey, diffOptionKeys, matchOptionKeysAgainst } from "./options-keys.js";

describe("normalizeRubyKey", () => {
  it("camelizes a snake_case symbol (:inverse_of → inverseOf)", () => {
    expect(normalizeRubyKey("inverse_of")).toBe("inverseOf");
    expect(normalizeRubyKey("through")).toBe("through");
  });

  it("applies known non-derivable renames (:constructor → constructorFn)", () => {
    expect(normalizeRubyKey("constructor")).toBe("constructorFn");
  });
});

describe("diffOptionKeys", () => {
  it("reports a Ruby key missing from the TS interface (normalized)", () => {
    const diff = diffOptionKeys(["inverse_of", "through"], ["through"]);
    expect(diff.missingInTs).toEqual(["inverseOf"]);
    expect(diff.extraInTs).toEqual([]);
  });

  it("reports a TS key absent from the Ruby body as informational extra", () => {
    const diff = diffOptionKeys(["through"], ["through", "validate"]);
    expect(diff.missingInTs).toEqual([]);
    expect(diff.extraInTs).toEqual(["validate"]);
  });

  it("suppresses a known rename (:constructor) instead of flagging it missing", () => {
    expect(diffOptionKeys(["constructor", "mapping"], ["constructorFn", "mapping"])).toEqual({
      missingInTs: [],
      extraInTs: [],
    });
  });

  it("ignores leading-underscore internal keys on both sides", () => {
    const diff = diffOptionKeys(["_uses_legacy_index_name", "name"], ["_skipValidateOptions"]);
    expect(diff.missingInTs).toEqual(["name"]);
    expect(diff.extraInTs).toEqual([]);
  });

  it("normalizes both sides so equal keys don't surface, and sorts", () => {
    expect(diffOptionKeys(["inverse_of"], ["inverseOf"])).toEqual({
      missingInTs: [],
      extraInTs: [],
    });
    const diff = diffOptionKeys(["b_key", "a_key"], ["zKey", "yKey"]);
    expect(diff.missingInTs).toEqual(["aKey", "bKey"]);
    expect(diff.extraInTs).toEqual(["yKey", "zKey"]);
  });
});

describe("matchOptionKeysAgainst", () => {
  it("is not comparable when no candidate carried checkable keys (all null/empty)", () => {
    expect(matchOptionKeysAgainst(["foo"], [null, null])).toEqual({ comparable: false });
    expect(matchOptionKeysAgainst(["foo"], [])).toEqual({ comparable: false });
  });

  it("distinguishes null (uncheckable) from [] (real empty object)", () => {
    // An empty TS options object IS comparable — every Ruby key is missing.
    const verdict = matchOptionKeysAgainst(["foo_bar"], [[]]);
    expect(verdict).toEqual({ comparable: true, missingInTs: ["fooBar"], extraInTs: [] });
  });

  it("flags a known missing key for a fixture pair", () => {
    const ruby = ["inverse_of", "through", "source"];
    const ts = [["through", "source"]];
    const verdict = matchOptionKeysAgainst(ruby, ts);
    expect(verdict).toEqual({
      comparable: true,
      missingInTs: ["inverseOf"],
      extraInTs: [],
    });
  });

  it("unions checkable candidates so a binding's empty type doesn't mask the real one", () => {
    // Mixin convention: one candidate is the 0-arg re-export ([]), another the
    // real options type. The union covers all keys, so nothing false-positives.
    const verdict = matchOptionKeysAgainst(
      ["inverse_of", "through"],
      [null, ["inverseOf"], ["through"]],
    );
    expect(verdict).toEqual({ comparable: true, missingInTs: [], extraInTs: [] });
  });
});
