import { describe, expect, it } from "vitest";
import {
  INHERITANCE_EXCLUDE_PATH,
  findStaleInheritanceExcludes,
  inheritanceExcludeKeyOf,
  inheritanceExcludeKeys,
  loadInheritanceExcludes,
  parseInheritanceExcludes,
  type InheritanceExcludeEntry,
} from "./inheritance-exclude.js";

const entry: InheritanceExcludeEntry = {
  package: "activerecord",
  rubyFile: "connection_adapters/abstract/schema_dumper.rb",
  rubyFqn: "ActiveRecord::ConnectionAdapters::SchemaDumper",
  reason: "Single-class port: a static `extends` across the two modules is an ESM cycle.",
};

describe("parseInheritanceExcludes", () => {
  it("parses a well-formed entry", () => {
    expect(parseInheritanceExcludes(JSON.stringify([entry]))).toEqual([entry]);
  });

  it("rejects a non-array document", () => {
    expect(() => parseInheritanceExcludes("{}")).toThrow(/top-level array/);
  });

  it("rejects a missing key field", () => {
    const { rubyFqn: _rubyFqn, ...rest } = entry;
    expect(() => parseInheritanceExcludes(JSON.stringify([rest]))).toThrow(/"rubyFqn"/);
  });

  it("rejects an empty reason", () => {
    expect(() => parseInheritanceExcludes(JSON.stringify([{ ...entry, reason: " " }]))).toThrow(
      /"reason" must be a non-empty string/,
    );
  });

  it("rejects an unknown package", () => {
    expect(() =>
      parseInheritanceExcludes(JSON.stringify([{ ...entry, package: "activerecords" }])),
    ).toThrow(/unknown package "activerecords"/);
  });

  it("rejects a duplicate key", () => {
    expect(() =>
      parseInheritanceExcludes(JSON.stringify([entry, { ...entry, reason: "other" }])),
    ).toThrow(/duplicate entry/);
  });
});

describe("findStaleInheritanceExcludes", () => {
  it("reports an entry that suppressed nothing", () => {
    expect(findStaleInheritanceExcludes([entry], [])).toEqual([entry]);
  });

  it("reports nothing when the entry was applied", () => {
    expect(findStaleInheritanceExcludes([entry], [inheritanceExcludeKeyOf(entry)])).toEqual([]);
  });
});

describe("inheritance-exclude.json", () => {
  it("parses, and every entry carries a reason", async () => {
    const entries = await loadInheritanceExcludes(INHERITANCE_EXCLUDE_PATH);
    for (const e of entries) expect(e.reason.trim().length).toBeGreaterThan(0);
    expect(inheritanceExcludeKeys(entries).size).toBe(entries.length);
  });
});
