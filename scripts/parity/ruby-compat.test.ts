import { describe, expect, it } from "vitest";
import {
  AMBIGUOUS_RUBY_CALLS,
  RECEIVER_KEYED_RUBY_COMPAT_EXPORTS,
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
    // A burndown that has reached zero, so the loop is vacuous today; the
    // invariant is asserted whole so a row that comes back is still held to it.
    expect([...AMBIGUOUS_RUBY_CALLS.values()].every((reason) => /`.+`/.test(reason))).toBe(true);
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

describe("RECEIVER_KEYED_RUBY_COMPAT_EXPORTS", () => {
  it("keys every row by an MRI spelling", () => {
    for (const mri of RECEIVER_KEYED_RUBY_COMPAT_EXPORTS.keys())
      expect(mri).toMatch(/^[A-Z]\w*[#.]\S+$/);
  });

  it("gives every row a receiver its own MRI key names", () => {
    for (const [mri, row] of RECEIVER_KEYED_RUBY_COMPAT_EXPORTS)
      expect(mri.toLowerCase().startsWith(row.receiver)).toBe(true);
  });

  it("takes no row the unconditional table already claims by bare name", () => {
    const unconditional = new Set([...RUBY_COMPAT_EXPORTS.keys()].map(rubyCallName));
    for (const mri of RECEIVER_KEYED_RUBY_COMPAT_EXPORTS.keys())
      expect(unconditional).not.toContain(rubyCallName(mri));
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

  it("resolves a receiver-keyed row only where every site proves the receiver", () => {
    expect(rubyCompatExport("fetch", ["hash"])).toBe("fetch");
    expect(rubyCompatExport("merge!", ["hash"])).toBe("mergeBang");
    expect(rubyCompatExport("to_s", ["symbol"])).toBe("symbolToS");
    expect(rubyCompatExport("succ", ["string"])).toBe("succ");
    // `cache.fetch` records `local`, and a body mixing the two proves neither.
    expect(rubyCompatExport("fetch", ["local"])).toBeUndefined();
    expect(rubyCompatExport("fetch", ["hash", "local"])).toBeUndefined();
    expect(rubyCompatExport("to_s", ["ivar"])).toBeUndefined();
    expect(rubyCompatExport("succ", ["numeric"])).toBeUndefined();
  });

  it("ignores a receiver on a row that resolves from the bare name alone", () => {
    expect(rubyCompatExport("key?", ["local"])).toBe("hasKey");
    expect(rubyCompatExport("escape", ["const"])).toBe("regexpEscape");
  });

  it("forwards the receiver through jsEnumerableAliases", () => {
    expect(jsEnumerableAliases("merge", ["hash"])).toEqual(["merge"]);
    expect(jsEnumerableAliases("merge")).toEqual([]);
    expect(jsEnumerableAliases("reject", ["hash"])).toEqual(["filter", "reject"]);
  });

  it("forwards a Ruby core call through jsEnumerableAliases", () => {
    expect(jsEnumerableAliases("cover?")).toEqual(["cover"]);
    expect(jsEnumerableAliases("escape")).toEqual(["regexpEscape"]);
  });

  it("unions with the Enumerable table, and leaves the fs-adapter one alone", () => {
    expect(jsEnumerableAliases("key?")).toEqual(["has", "hasKey"]);
    expect(jsEnumerableAliases("exist?")).toEqual(["existsSync", "exists"]);
  });
});
