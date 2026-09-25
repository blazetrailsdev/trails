import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MethodInfo } from "@blazetrails/parity/types";
import type { SkeletonRow } from "./report-arms.js";
import {
  sampleRows,
  tsVoidReturns,
  voidReturnRows,
  type ApiManifest,
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

const USES: ReturnUses = {
  activerecord: {
    establish_connection: { count: 1, site: "pending_migration_connection.rb:6" },
    "connection_specification_name=": { count: 1, site: "x.rb:1" },
  },
  activesupport: { assert_not: { count: 1, site: "test_case_test.rb:21" } },
  activemodel: { forgetting_assignment: { count: 1, site: "attribute.rb:9" } },
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

describe("sampleRows", () => {
  it("draws the same rows whatever order they arrive in", () => {
    expect(sampleRows(rows, 1)).toEqual(sampleRows([...rows].reverse(), 1));
    expect(sampleRows(rows, 1)).toHaveLength(1);
  });
});

describe("extract-return-uses.rb", () => {
  let dir: string;
  let uses: Record<string, { count: number; site: string }>;

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
      ].join("\n"),
    );
    const script = path.join(import.meta.dirname, "extract-return-uses.rb");
    const stdout = execFileSync("ruby", [script, JSON.stringify({ pkg: [dir] })], {
      encoding: "utf-8",
    });
    uses = JSON.parse(stdout).pkg;
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
    expect(uses.establish_connection.site).toMatch(/sample\.rb:1$/);
  });

  it("skips assert_nil's argument, Ruby core names, statements and locals", () => {
    expect(uses).not.toHaveProperty("disconnect!");
    expect(uses).not.toHaveProperty("each");
    expect(uses).not.toHaveProperty("statement_only");
    expect(uses).not.toHaveProperty("local");
  });
});
