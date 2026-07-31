import { stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  activerecordSrcRoot,
  canonicalLoaderModules,
  canonicalLoaderSelfTests,
  testInfraExemptIgnores,
} from "./test-infra-scope.mjs";
import { noRawSqlRoot } from "./no-raw-sql-scope.mjs";
import { ALLOW } from "./no-internal-canonical-loaders.mjs";

const SRC = "packages/activerecord/src";

describe("test-infra lint scope", () => {
  // Pinned to the literal lists the two config blocks and the rule carried
  // before they were converged, so the convergence stays behaviour-preserving.
  it("exposes the exemption globs the table-lifecycle config blocks apply", () => {
    expect(testInfraExemptIgnores).toEqual([
      `${SRC}/test-helpers/**`,
      `${SRC}/support/**`,
      `${SRC}/fixtures.test.ts`,
      `${SRC}/naked-fixtures.test.ts`,
      `${SRC}/test-fixtures.test.ts`,
      `${SRC}/test-fixtures/**`,
    ]);
  });

  it("allowlists exactly the canonical loaders' own unit tests", () => {
    expect(canonicalLoaderSelfTests).toEqual([
      `${SRC}/support/canonical-schema.test.ts`,
      `${SRC}/support/canonical-table-rebuild.test.ts`,
      `${SRC}/support/load-schema-helper.test.ts`,
      `${SRC}/support/load-schema-helper.trails.test.ts`,
      `${SRC}/support/load-schema-helper-uuid-default.trails.test.ts`,
      `${SRC}/support/load-schema-helper-arm-guard.trails.test.ts`,
      `${SRC}/support/stubbed-ddl-methods.test.ts`,
    ]);
    expect([...ALLOW]).toEqual(canonicalLoaderSelfTests);
    expect(canonicalLoaderModules).toEqual([
      "canonical-schema",
      "canonical-table-rebuild",
      "load-schema-helper",
    ]);
  });

  // A stale entry is invisible at lint time — ESLint silently matches nothing —
  // so an RFC 0064 file move that skipped this file would go unnoticed, which is
  // the failure mode the single source of truth exists to prevent.
  it("names paths that still exist", async () => {
    for (const entry of [...testInfraExemptIgnores, ...canonicalLoaderSelfTests]) {
      const target = entry.replace(/\/\*\*$/, "");
      await expect(stat(target), target).resolves.toBeTruthy();
    }
  });

  it("shares one root with the no-raw-sql scope", () => {
    expect(activerecordSrcRoot).toBe(SRC);
    expect(noRawSqlRoot).toBe(activerecordSrcRoot);
  });
});
