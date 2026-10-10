import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MethodInfo } from "@blazetrails/parity/types";
import type { SkeletonRow } from "./report-arms.js";
import {
  rubyPrivates,
  sampleRows,
  tsVoidReturns,
  voidReturnRows,
  type ApiManifest,
  type PackageReturnUses,
  type ReturnUses,
} from "./report-void-returns.js";

// prettier-ignore
const PAIRS = [
  ["activerecord", "connection_handling.rb", "establish_connection", "connection-handling.ts", "establishConnection", true],
  ["activerecord", "connection_handling.rb", "connection_specification_name=", "connection-handling.ts", "setConnectionSpecificationName", true],
  ["activerecord", "testing/query_assertions.rb", "assert_queries_count", "testing/query-assertions.ts", "assertQueriesCount", true],
  ["activesupport", "testing/assertions.rb", "assert_not", "testing/assertions.ts", "assertNot", true],
  ["activesupport", "testing/assertions.rb", "assert_nothing_raised", "testing/assertions.ts", "assertNothingRaised", true],
  ["activemodel", "attribute.rb", "forgetting_assignment", "attribute.ts", "forgettingAssignment", true],
] as const;

const uses = (reads: PackageReturnUses["reads"], defs: PackageReturnUses["defs"] = {}) => ({
  lib: "lib",
  reads,
  defs,
});

const USES: ReturnUses = {
  activerecord: uses({
    establish_connection: [["lib/pending_migration_connection.rb", 6, false]],
    "connection_specification_name=": [["lib/x.rb", 1, true]],
  }),
  activesupport: uses({ assert_not: [["test/test_case_test.rb", 21, true]] }),
  activemodel: uses({ forgetting_assignment: [["lib/attribute.rb", 9, false]] }),
};

function manifest(): ApiManifest {
  const packages: ApiManifest["packages"] = {};
  for (const [pkg, , , tsFile, tsName, returnsVoid] of PAIRS) {
    const m: MethodInfo = {
      name: tsName,
      visibility: "public",
      params: [],
      file: tsFile,
      returnsVoid,
    };
    ((packages[pkg] ??= {}).fileFunctions ??= {})[tsFile] = [
      ...(packages[pkg].fileFunctions[tsFile] ?? []),
      m,
    ];
  }
  packages.activemodel.fileFunctions!["attribute.ts"]?.push({
    name: "forgettingAssignment",
    visibility: "public",
    params: [],
    file: "attribute.ts",
  });
  return { packages };
}

const skeletons = PAIRS.map(
  ([pkg, rubyFile, rubyName, tsFile, tsName]) =>
    ({ package: pkg, rubyFile, rubyName, tsFile, tsName, ruby: [], ts: [] }) as SkeletonRow,
);
const rows = voidReturnRows(skeletons, USES, tsVoidReturns(manifest()));

describe("voidReturnRows", () => {
  it("reports a void port whose return value a Rails caller reads", () => {
    expect(rows.map((r) => r.rubyName)).toEqual(["establish_connection", "assert_not"]);
  });

  it("leaves out setters, unread returns, and names with a non-void declaration", () => {
    const names = rows.map((r) => r.rubyName);
    expect(names).not.toContain("connection_specification_name=");
    expect(names).not.toContain("assert_queries_count");
    expect(names).not.toContain("forgetting_assignment");
  });
});

describe("voidReturnRows homonyms", () => {
  const pair = (rubyFile: string, tsFile: string) =>
    ({ package: "ar", rubyFile, rubyName: "validate", tsFile, tsName: "validate" }) as SkeletonRow;
  const pairs = [pair("migration.rb", "migration.ts"), pair("fixture_set/file.rb", "file.ts")];
  const voids = new Set(pairs.map((r) => `ar\u0000${r.tsFile}\u0000validate`));
  const defs = { "lib/migration.rb": ["validate"], "lib/fixture_set/file.rb": ["validate"] };
  const files = (reads: PackageReturnUses["reads"], privates?: Set<string>) =>
    voidReturnRows(pairs, { ar: uses(reads, defs) }, voids, privates).map((r) => r.rubyFile);

  it("attributes a receiverless read to the definition in its own file only", () => {
    expect(files({ validate: [["lib/fixture_set/file.rb", 55, true]] })).toEqual([
      "fixture_set/file.rb",
    ]);
    expect(files({ validate: [["lib/other.rb", 3, true]] })).toEqual([
      "migration.rb",
      "fixture_set/file.rb",
    ]);
  });

  it("does not attribute a read through a receiver to a private method", () => {
    const rubyApi = {
      packages: {
        ar: {
          fileFunctions: {
            "migration.rb": [
              { name: "validate", visibility: "private", params: [], file: "migration.rb" },
            ],
          },
        },
      },
    } as ApiManifest;
    const privates = rubyPrivates(rubyApi);
    expect(files({ validate: [["lib/other.rb", 3, false]] }, privates)).toEqual([
      "fixture_set/file.rb",
    ]);
    expect(files({ validate: [["lib/other.rb", 3, true]] }, privates)).toEqual([
      "migration.rb",
      "fixture_set/file.rb",
    ]);
  });
});

describe("sampleRows", () => {
  it("draws the same rows whatever order they arrive in", () => {
    expect(sampleRows(rows, 1)).toEqual(sampleRows([...rows].reverse(), 1));
    expect(sampleRows(rows, 1)).toHaveLength(1);
  });
});

describe("extract-return-uses.rb", () => {
  let dir: string;
  let uses: Record<string, [file: string, line: number, bare: boolean][]>;
  let defs: Record<string, string[]>;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "return-uses-"));
    await writeFile(
      path.join(dir, "sample.rb"),
      [
        "pool = establish_connection(config)",
        "@cache ||= build_cache",
        "assert_equal true, assert_not(nil)",
        "lease(key: checkout_pool)",
        "migration_context.open.pending_migrations",
        "assert_nil disconnect!",
        "records.each { |r| r }.size",
        "statement_only(1)",
        "local = 1; local.to_s",
        "def validate(x) = x",
        "def self.build(x) = x",
      ].join("\n"),
    );
    const script = path.join(import.meta.dirname, "extract-return-uses.rb");
    const stdout = execFileSync("ruby", [script, JSON.stringify({ pkg: [dir] })], {
      encoding: "utf-8",
    });
    ({ reads: uses, defs } = JSON.parse(stdout).pkg);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("records an assignment RHS, a call argument, a kwarg value and a chained receiver", () => {
    expect(Object.keys(uses).sort()).toEqual(
      [
        "assert_not",
        "build_cache",
        "checkout_pool",
        "config",
        "establish_connection",
        "migration_context",
        "open",
        "records",
      ].sort(),
    );
    expect(uses.establish_connection[0][0]).toMatch(/sample\.rb$/);
    expect(uses.establish_connection[0].slice(1)).toEqual([1, true]);
    expect(uses.open[0].slice(1)).toEqual([5, false]);
  });

  it("lists the method names each file defines", () => {
    expect(Object.values(defs)).toEqual([["validate", "build"]]);
  });

  it("skips assert_nil's argument, Ruby core names, statements and locals", () => {
    expect(uses).not.toHaveProperty("disconnect!");
    expect(uses).not.toHaveProperty("each");
    expect(uses).not.toHaveProperty("statement_only");
    expect(uses).not.toHaveProperty("local");
  });
});
