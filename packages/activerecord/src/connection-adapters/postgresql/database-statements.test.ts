import { describe, expect, it } from "vitest";
import { buildTruncateStatements } from "./database-statements.js";
import { PostgreSQLAdapter } from "../postgresql-adapter.js";

describe("PostgreSQL::DatabaseStatements#buildTruncateStatements", () => {
  const host = { quoteTableName: (name: string) => `"${name}"` };

  it("combines all table names into a single TRUNCATE statement", () => {
    expect(buildTruncateStatements.call(host, ["a", "b", "c"])).toEqual([
      `TRUNCATE TABLE "a", "b", "c"`,
    ]);
  });

  it("is wired onto the PG adapter so truncateTables emits the combined form", () => {
    const wired = (PostgreSQLAdapter.prototype as unknown as Record<string, unknown>)
      .buildTruncateStatements as typeof buildTruncateStatements;
    expect(wired.call(host, ["a", "b", "c"])).toEqual([`TRUNCATE TABLE "a", "b", "c"`]);
  });
});
