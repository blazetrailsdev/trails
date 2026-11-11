import { describe, expect, it } from "vitest";
import {
  attribute,
  gateRows,
  mergeManifest,
  newRows,
  pairSeed,
  testDelta,
  testSeed,
  type HashRecord,
  type RubyTestManifest,
} from "./ledger.js";

const hash = (rubyName: string, digest: string, tsFile = "base.ts"): HashRecord => ({
  package: "activerecord",
  rubyFile: "base.rb",
  rubyName,
  tsFile,
  tsName: rubyName,
  digest,
});

describe("mergeManifest", () => {
  it("replaces the source's packages and keeps every other one", () => {
    const active = { extractor: "1", packages: { arel: "old", rack: "rack", gone: "x" } };
    const candidate = { extractor: "2", packages: { arel: "new" } };
    expect(mergeManifest(active, candidate, ["arel", "gone"])).toEqual({
      extractor: "1",
      packages: { arel: "new", rack: "rack" },
    });
    expect(active.packages.arel).toBe("old");
  });
});

describe("pairSeed", () => {
  it("seeds a drifted pin as drift and an unresolved pin as removed", () => {
    const pins = [{ ...hash("save", "a") }, { ...hash("destroy", "b") }, { ...hash("touch", "c") }];
    const rows = pairSeed(pins, [hash("save", "a2"), hash("destroy", "b")], "v8.0.2", "v8.0.5.2");
    expect(rows.map((r) => [r.rubyName, r.kind])).toEqual([
      ["save", "drift"],
      ["touch", "removed"],
    ]);
    expect(rows[0]).toMatchObject({ from: "v8.0.2", to: "v8.0.5.2" });
  });
});

describe("testDelta and testSeed", () => {
  const manifest = (cases: [string, string, string[]][]): RubyTestManifest => ({
    packages: {
      arel: {
        files: [
          {
            file: "a_test.rb",
            testCases: cases.map(([path, description, assertions]) => ({
              path,
              description,
              file: "a_test.rb",
              line: 1,
              assertions,
            })),
          },
        ],
      },
    },
  });
  const active = manifest([
    ["A > one", "one", ["assert"]],
    ["A > two", "two", ["assert"]],
    ["A > three", "three", ["assert"]],
    ["A > four", "four", ["assert"]],
  ]);
  const candidate = manifest([
    ["A > one", "one", ["assert", "assert_nil"]],
    ["A > two", "two", ["assert"]],
    ["A > B > three", "three", ["assert"]],
    ["A > five", "five", ["assert"]],
  ]);

  it("counts added, removed, changed and moved tests", () => {
    expect(testDelta(active, candidate, "arel")).toEqual({
      before: 4,
      after: 4,
      added: 1,
      removed: 1,
      changed: ["a_test.rb A > one"],
      moved: ["a_test.rb A > three"],
    });
  });

  it("seeds only the changed or moved tests test-compare matched", () => {
    const delta = testDelta(active, candidate, "arel");
    const missing = new Map([["arel a_test.rb", new Set(["three"])]]);
    expect(testSeed("arel", delta, active, missing, "v8.0.2", "v8.0.5.2")).toEqual([
      {
        package: "arel",
        rubyFile: "a_test.rb",
        path: "A > one",
        kind: "changed",
        from: "v8.0.2",
        to: "v8.0.5.2",
      },
    ]);
    expect(testSeed("arel", delta, active, new Map(), "v8.0.2", "v8.0.5.2")).toEqual([]);
  });
});

describe("attribute", () => {
  const seed = pairSeed([hash("save", "a")], [hash("save", "a2")], "v8.0.2", "v8.0.5.2");
  const active = [hash("save", "a"), hash("reload", "r"), hash("touch", "t", "other.ts")];
  const candidate = [hash("save", "a2"), hash("reload", "r2"), hash("touch", "t", "other.ts")];

  it("attributes new rows to the seed, to an unpinned changed body, or to nothing", () => {
    const base = {
      mismatches: [
        { package: "activerecord", tsFile: "base.ts", rubyName: "save", missing: ["x"] },
      ],
    };
    const cand = {
      mismatches: [
        { package: "activerecord", tsFile: "base.ts", rubyName: "save", missing: ["x"] },
        { package: "activerecord", tsFile: "base.ts", rubyName: "save", missing: ["y"] },
        { package: "activerecord", tsFile: "base.ts", rubyName: "reload", missing: ["z"] },
        { package: "activerecord", tsFile: "other.ts", rubyName: "touch", missing: ["w"] },
        { package: "activerecord", tsFile: "base.ts", tsName: "extraName" },
      ],
    };
    const fresh = newRows(gateRows(base), gateRows(cand));
    expect(attribute(fresh, seed, active, candidate).map((r) => r.attribution)).toEqual([
      "drift",
      "unpinnedChanged",
      null,
      "fileSeed",
    ]);
  });
});
