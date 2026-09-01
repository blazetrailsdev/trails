import { describe, expect, it } from "vitest";
import {
  AMBIGUOUS_RUBY_CALLS,
  RUBY_COMPAT_EXPORTS,
  rubyCallName,
  rubyCompatAliases,
  rubyCompatExport,
} from "./ruby-compat.js";
import { jsEnumerableAliases } from "../api-compare/enumerable-idioms.js";

describe("RUBY_COMPAT_EXPORTS", () => {
  it("keys every row by an MRI spelling", () => {
    for (const mri of RUBY_COMPAT_EXPORTS.keys()) expect(mri).toMatch(/^[A-Z]\w*[#.]\S+$/);
  });

  it("gives every excluded member the homonym that excludes it", () => {
    for (const reason of AMBIGUOUS_RUBY_CALLS.values()) expect(reason).toMatch(/`.+`/);
  });

  it("keeps the folded CORE_LIBRARY_ALIASES entry", () => {
    expect(RUBY_COMPAT_EXPORTS.get("Regexp.escape")).toBe("regexpEscape");
    expect(rubyCompatAliases("escape")).toEqual(["regexpEscape"]);
  });

  it("holds no row whose bare name is recorded ambiguous", () => {
    const ambiguous = new Set([...AMBIGUOUS_RUBY_CALLS.keys()].map(rubyCallName));
    for (const mri of RUBY_COMPAT_EXPORTS.keys())
      expect(ambiguous).not.toContain(rubyCallName(mri));
  });
});

describe("rubyCompatExport", () => {
  it("resolves an unambiguous Ruby core call to its ruby-compat export", () => {
    expect(rubyCompatExport("key?")).toBe("hasKey");
    expect(rubyCompatExport("cover?")).toBe("cover");
  });

  it("resolves nothing for an ambiguous receiver, nor a call the table omits", () => {
    for (const call of ["fetch", "merge", "to_s", "run_callbacks"]) {
      expect(rubyCompatExport(call)).toBeUndefined();
      expect(rubyCompatAliases(call)).toEqual([]);
    }
  });

  it("forwards a Ruby core call through jsEnumerableAliases", () => {
    expect(jsEnumerableAliases("cover?")).toEqual(["cover"]);
    expect(jsEnumerableAliases("escape")).toEqual(["regexpEscape"]);
  });

  it("unions with the Enumerable table, and leaves the fs-adapter one alone", () => {
    // `key?` is `Map#has` on a Map receiver AND ruby-compat's `hasKey` on an
    // object one; both spellings are the whole call, so neither shadows the
    // other. `exist?` is claimed by the fs table alone.
    expect(jsEnumerableAliases("key?")).toEqual(["has", "hasKey"]);
    expect(jsEnumerableAliases("exist?")).toEqual(["existsSync", "exists"]);
  });
});
