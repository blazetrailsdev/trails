import { describe, expect, it } from "vitest";
import type { MethodInfo } from "@blazetrails/parity/types";
import type { SkeletonRow } from "./report-arms.js";
import {
  rubyLastExprs,
  sampleRows,
  tsVoidReturns,
  voidReturnRows,
  type ApiManifest,
} from "./report-void-returns.js";

// [package, rubyFile, rubyName, lastExpr, tsFile, tsName, returnsVoid] — the
// methods of RFC 0155's four discarded-return stories, as first filed.
// prettier-ignore
const PAIRS = [
  ["activerecord", "connection_handling.rb", "establish_connection", "call", "connection-handling.ts", "establishConnection", true],
  ["activerecord", "connection_handling.rb", "connection_specification_name=", "call", "connection-handling.ts", "setConnectionSpecificationName", true],
  ["activerecord", "testing/query_assertions.rb", "assert_queries_count", "call", "testing/query-assertions.ts", "assertQueriesCount", true],
  ["activesupport", "testing/assertions.rb", "assert_not", "call", "testing/assertions.ts", "assertNot", true],
  ["activesupport", "testing/assertions.rb", "assert_nothing_raised", "assign", "testing/assertions.ts", "assertNothingRaised", true],
  ["activemodel", "attribute.rb", "forgetting_assignment", "call", "attribute.ts", "forgettingAssignment", true],
] as const;

function manifest(side: "ruby" | "ts"): ApiManifest {
  const packages: ApiManifest["packages"] = {};
  for (const [pkg, rubyFile, rubyName, lastExpr, tsFile, tsName, returnsVoid] of PAIRS) {
    const m: MethodInfo =
      side === "ruby"
        ? { name: rubyName, visibility: "public", params: [], file: rubyFile, lastExpr }
        : { name: tsName, visibility: "public", params: [], file: tsFile, returnsVoid };
    ((packages[pkg] ??= {}).fileFunctions ??= {})[m.file!] = [
      ...(packages[pkg].fileFunctions[m.file!] ?? []),
      m,
    ];
  }
  // `FromDatabase#forgettingAssignment` beside it returns a value.
  packages.activemodel.fileFunctions!["attribute.ts"]?.push({
    name: "forgettingAssignment",
    visibility: "public",
    params: [],
    file: "attribute.ts",
  });
  return { packages };
}

const skeletons = PAIRS.map(
  ([pkg, rubyFile, rubyName, , tsFile, tsName]) =>
    ({ package: pkg, rubyFile, rubyName, tsFile, tsName, ruby: [], ts: [] }) as SkeletonRow,
);
const rows = voidReturnRows(
  skeletons,
  rubyLastExprs(manifest("ruby")),
  tsVoidReturns(manifest("ts")),
);

describe("voidReturnRows", () => {
  it("reports a void port of a Rails body ending in a call", () => {
    expect(rows.map((r) => r.rubyName)).toEqual([
      "establish_connection",
      "assert_queries_count",
      "assert_not",
    ]);
  });

  it("leaves out setters, bodies ending in an assignment, and names with a non-void declaration", () => {
    const names = rows.map((r) => r.rubyName);
    expect(names).not.toContain("connection_specification_name=");
    expect(names).not.toContain("assert_nothing_raised");
    expect(names).not.toContain("forgetting_assignment");
  });
});

describe("sampleRows", () => {
  it("draws the same rows whatever order they arrive in", () => {
    expect(sampleRows(rows, 2)).toEqual(sampleRows([...rows].reverse(), 2));
    expect(sampleRows(rows, 2)).toHaveLength(2);
  });
});
