import { describe, expect, it } from "vitest";
import { isExcludedPath, noRawSqlFiles, noRawSqlIgnores } from "./no-raw-sql-scope.mjs";

const SRC = "packages/activerecord/src";

describe("no-raw-sql scope", () => {
  it("keeps ordinary activerecord src files in scope", () => {
    expect(isExcludedPath(`${SRC}/relation.ts`)).toBe(false);
    expect(isExcludedPath(`${SRC}/relation/query-methods.ts`)).toBe(false);
    expect(isExcludedPath(`${SRC}/cases/other.ts`)).toBe(false);
  });

  it("scopes out the adapter, DDL and test-infra paths", () => {
    for (const rel of [
      `${SRC}/relation.test.ts`,
      `${SRC}/connection-adapters/sqlite.ts`,
      `${SRC}/adapters/pg.ts`,
      `${SRC}/tasks/database.ts`,
      `${SRC}/schema-dumper.ts`,
      `${SRC}/migration/schema-statements.ts`,
      `${SRC}/test-helpers/test-schema.ts`,
      `${SRC}/support/canonical-schema.ts`,
      `${SRC}/test-setup-ar.ts`,
      `${SRC}/cases/helper.ts`,
    ]) {
      expect(isExcludedPath(rel), rel).toBe(true);
    }
  });

  it("exposes the globs the flat config applies", () => {
    expect(noRawSqlFiles).toEqual([`${SRC}/**/*.ts`]);
    expect(noRawSqlIgnores).toContain(`${SRC}/cases/helper.ts`);
  });
});
