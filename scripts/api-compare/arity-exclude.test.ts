import { describe, expect, it } from "vitest";
import * as fs from "fs/promises";
import {
  ARITY_EXCLUDE_PATH,
  arityExcludeKeyOf,
  findStaleArityExcludes,
  indexArityExcludes,
  loadArityExcludes,
  parseArityExcludes,
  type ArityExcludeEntry,
} from "./arity-exclude.js";
import { missingScope, reportStale } from "./lint-arity-excludes.js";

const entry: ArityExcludeEntry = {
  package: "activerecord",
  rubyFile: "relation/query_methods.rb",
  rubyName: "where",
  reason: "State-threading deviation: the port takes an explicit relation receiver.",
};

describe("parseArityExcludes", () => {
  it("parses a well-formed entry", () => {
    expect(parseArityExcludes(JSON.stringify([entry]))).toEqual([entry]);
  });

  it("rejects a non-array document", () => {
    expect(() => parseArityExcludes("{}")).toThrow(/top-level array/);
  });

  it("rejects a missing key field", () => {
    const { rubyName: _rubyName, ...rest } = entry;
    expect(() => parseArityExcludes(JSON.stringify([rest]))).toThrow(/"rubyName"/);
  });

  it("rejects an empty reason", () => {
    expect(() => parseArityExcludes(JSON.stringify([{ ...entry, reason: "  " }]))).toThrow(
      /"reason" must be a non-empty string/,
    );
  });

  it("rejects an unknown package", () => {
    expect(() =>
      parseArityExcludes(JSON.stringify([{ ...entry, package: "activerecords" }])),
    ).toThrow(/unknown package "activerecords"/);
  });

  it("rejects a duplicate key", () => {
    expect(() =>
      parseArityExcludes(JSON.stringify([entry, { ...entry, reason: "other" }])),
    ).toThrow(/duplicate entry/);
  });
});

describe("the committed exclude file", () => {
  it("is valid and ships empty", async () => {
    const entries = await loadArityExcludes();
    // Populating it is the arity-state-threading-triage story's job, not this one.
    expect(entries).toEqual([]);
    expect(await fs.readFile(ARITY_EXCLUDE_PATH, "utf-8")).toMatch(/\n$/);
  });
});

describe("indexArityExcludes", () => {
  it("keys on package + rubyFile + rubyName", () => {
    const index = indexArityExcludes([entry]);
    expect(index.has(arityExcludeKeyOf(entry))).toBe(true);
    expect(index.has(arityExcludeKeyOf({ ...entry, package: "activemodel" }))).toBe(false);
    expect(index.has(arityExcludeKeyOf({ ...entry, rubyFile: "relation.rb" }))).toBe(false);
    expect(index.has(arityExcludeKeyOf({ ...entry, rubyName: "order" }))).toBe(false);
  });
});

describe("findStaleArityExcludes", () => {
  it("keeps an entry that suppressed a mismatch", () => {
    expect(findStaleArityExcludes([entry], [arityExcludeKeyOf(entry)])).toEqual([]);
  });

  it("flags an entry whose pair no longer mismatches", () => {
    expect(findStaleArityExcludes([entry], [])).toEqual([entry]);
  });

  it("flags an entry whose pair no longer exists", () => {
    expect(
      findStaleArityExcludes([entry], [arityExcludeKeyOf({ ...entry, rubyName: "order" })]),
    ).toEqual([entry]);
  });
});

describe("lint-arity-excludes", () => {
  it("names the stale entries in its report", () => {
    expect(reportStale([entry])).toContain("activerecord relation/query_methods.rb where");
  });

  it("treats a package-filtered artifact as partial scope", () => {
    expect(missingScope({ packages: ["activerecord"] }, ["activerecord", "activemodel"])).toEqual([
      "activemodel",
    ]);
    expect(missingScope({ packages: ["activemodel", "activerecord"] }, ["activerecord"])).toEqual(
      [],
    );
  });

  it("treats an artifact with no packages field as partial scope", () => {
    expect(missingScope({}, ["activerecord"])).toEqual(["activerecord"]);
  });
});
