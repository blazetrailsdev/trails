import { describe, expect, it } from "vitest";
import {
  attribute,
  gateRows,
  mergeManifest,
  newRows,
  pairSeed,
  constantSeed,
  signatureSeed,
  suspendedTests,
  testDelta,
  testSeed,
  type HashRecord,
  type RubyTestManifest,
  type TestSeedRow,
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
      moved: [{ from: "a_test.rb A > three", to: "a_test.rb A > B > three" }],
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
    const all = new Map([["arel a_test.rb", new Set<string>()]]);
    expect(testSeed("arel", delta, active, all, "v8.0.2", "v8.0.5.2")[1]).toEqual({
      package: "arel",
      rubyFile: "a_test.rb",
      path: "A > three",
      kind: "moved",
      toPath: "A > B > three",
      from: "v8.0.2",
      to: "v8.0.5.2",
    });
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

describe("signatureSeed", () => {
  const k = (rubyName: string) => ({ package: "activesupport", rubyFile: "try.rb", rubyName });
  const pin = (rubyName: string) => ({ ...k(rubyName), digest: "d" });
  it("seeds a pinned pair that gains a signature row and no body seed row", () => {
    const rows = signatureSeed(
      [k("try")],
      [k("try"), k("try"), k("tryBang"), k("drifted"), k("unpinned")],
      [k("drifted")],
      [pin("try"), pin("tryBang"), pin("drifted")],
      "v8.0.2",
      "v8.0.5.2",
    );
    expect(rows.map((r) => [r.rubyName, r.kind])).toEqual([
      ["try", "signature"],
      ["tryBang", "signature"],
    ]);
  });
});

describe("suspendedTests", () => {
  const row = (p: string): TestSeedRow => ({
    package: "activerecord",
    rubyFile: "base_test.rb",
    path: p,
    kind: "changed",
    from: "v8.0.2",
    to: "v8.0.5.2",
  });
  it("keeps a test the candidate reports on a new axis only", () => {
    const axes = (entries: [string, string[]][]) =>
      new Map(entries.map(([d, a]) => [`activerecord base_test.rb ${d}`, new Set(a)]));
    const kept = suspendedTests(
      [row("T > new"), row("T > agrees"), row("T > already")],
      (r) => r.path.slice(4),
      axes([["already", ["assertionMismatches"]]]),
      axes([
        ["new", ["valueMismatches"]],
        ["already", ["assertionMismatches"]],
      ]),
    );
    expect(kept.map((r) => r.path)).toEqual(["T > new"]);
  });
});

describe("constantSeed", () => {
  it("seeds a removed file constant that is a new extra in its TS file only", () => {
    const api = (names: string[]) => ({
      packages: {
        actioncable: {
          fileConstants: {
            "subscription_adapter/redis.rb": Object.fromEntries(names.map((n) => [n, {}])),
          },
        },
      },
    });
    const rows = constantSeed(
      api(["ConnectionError", "Unported", "Kept"]),
      api(["Kept", "CONNECTION_ERRORS"]),
      [
        {
          package: "actioncable",
          tsFile: "subscription-adapter/redis.ts",
          tsName: "ConnectionError",
        },
      ],
      ["actioncable"],
      () => "subscription-adapter/redis.ts",
      "v8.0.2",
      "v8.0.5.2",
    );
    expect(rows.map((r) => [r.rubyName, r.kind])).toEqual([["ConnectionError", "constant"]]);
  });
});
