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

  it("reports a key the TS body reads that the Ruby body never names", () => {
    const diff = diffOptionKeys(["through"], ["through", "validate"], [], ["through", "validate"]);
    expect(diff.missingInTs).toEqual([]);
    expect(diff.extraInTs).toEqual(["validate"]);
  });

  it("does not report a key the options TYPE declares but the body never reads", () => {
    // timestamps(**options) — schema_definitions.rb:537 hands the hash straight
    // on; the shared ColumnOptions type declares every column key.
    const columnOptions = ["after", "array", "as", "limit", "null", "precision"];
    expect(diffOptionKeys(["null"], columnOptions, [], ["null"])).toEqual({
      missingInTs: [],
      extraInTs: [],
    });
  });

  it("counts a key the TS body reads through an untyped cast as present", () => {
    expect(diffOptionKeys(["column"], ["name"], [], ["column"])).toEqual({
      missingInTs: [],
      extraInTs: [],
    });
  });

  it("reads a Ruby keyword param as the keyword, not an extra key", () => {
    // delegated_type(role, types:, **options) — delegated_type.rb:231
    expect(
      diffOptionKeys(["scope"], ["scope", "types"], [], ["scope", "types"], ["types"]),
    ).toEqual({ missingInTs: [], extraInTs: [] });
  });

  it("drops a positional-param name from the TS reads as well", () => {
    // mysql/schema_definitions.rb:69 — `type = options[:type]`, `type` positional
    const diff = diffOptionKeys(["type"], ["type", "limit"], ["name", "type"], ["type"]);
    expect(diff).toEqual({ missingInTs: [], extraInTs: [] });
  });

  it("suppresses a known rename (:constructor) instead of flagging it missing", () => {
    expect(diffOptionKeys(["constructor", "mapping"], ["constructorFn", "mapping"])).toEqual({
      missingInTs: [],
      extraInTs: [],
    });
  });

  it("ignores leading-underscore internal keys on both sides", () => {
    const diff = diffOptionKeys(
      ["_uses_legacy_index_name", "name"],
      ["_skipValidateOptions"],
      [],
      ["_skipValidateOptions"],
    );
    expect(diff.missingInTs).toEqual(["name"]);
    expect(diff.extraInTs).toEqual([]);
  });

  it("drops a positional-param name leaked into the Ruby key set (new_column_definition :type)", () => {
    // `type` is the second positional arg of `new_column_definition(name, type, options)`
    // — a leaked symbol, not a real options-hash key, so it must not flag missing.
    const diff = diffOptionKeys(["type", "limit"], ["limit"], ["name", "type", "options"]);
    expect(diff.missingInTs).toEqual([]);
    expect(diff.extraInTs).toEqual([]);
  });

  it("normalizes positional param names before excluding them", () => {
    const diff = diffOptionKeys(["inverse_of", "real_opt"], [], ["inverse_of"]);
    expect(diff.missingInTs).toEqual(["realOpt"]);
  });

  it("normalizes both sides so equal keys don't surface, and sorts", () => {
    expect(diffOptionKeys(["inverse_of"], ["inverseOf"])).toEqual({
      missingInTs: [],
      extraInTs: [],
    });
    const diff = diffOptionKeys(["b_key", "a_key"], ["zKey", "yKey"], [], ["zKey", "yKey"]);
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

  it("excludes positional params passed through the matcher", () => {
    const verdict = matchOptionKeysAgainst(
      ["type", "limit"],
      [["limit"]],
      ["name", "type", "options"],
    );
    expect(verdict).toEqual({ comparable: true, missingInTs: [], extraInTs: [] });
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

  it("is quiet for a pass-through on both sides, whatever the options type declares", () => {
    // as_json(options) → serializable_hash(options), serializers/json.rb:103
    const ts = [["except", "include", "methods", "only", "root"]];
    expect(matchOptionKeysAgainst(["root"], ts, [], [["root"]])).toEqual({
      comparable: true,
      missingInTs: [],
      extraInTs: [],
    });
  });

  it("reports a key the TS body reads where the Ruby body only forwards", () => {
    const ts = [["except", "include", "methods", "only", "root"]];
    expect(matchOptionKeysAgainst(["root"], ts, [], [["root"], ["only"]])).toMatchObject({
      extraInTs: ["only"],
    });
  });

  it("reports nothing extra for a bodiless candidate", () => {
    expect(matchOptionKeysAgainst(["root"], [["root", "only"]])).toEqual({
      comparable: true,
      missingInTs: [],
      extraInTs: [],
    });
  });
});
