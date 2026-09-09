import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { buildTruncateStatements, isWriteQuery } from "./database-statements.js";
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

describe("PostgreSQL::DatabaseStatements#isWriteQuery", () => {
  it("answers true for a null sql, as Regexp#match?(nil) does in Ruby", () => {
    expect(isWriteQuery(null)).toBe(true);
  });

  it("retries the match against the bytes when the first match raises ArgumentError", () => {
    let matches = 0;
    const sql = {
      toString() {
        if (matches++ === 0) throw new ArgumentError("invalid byte sequence in UTF-8");
        return "SELECT 1";
      },
    } as unknown as string;

    expect(isWriteQuery(sql)).toBe(false);
  });

  it("re-raises anything but ArgumentError", () => {
    const sql = {
      toString() {
        throw new TypeError("boom");
      },
    } as unknown as string;

    expect(() => isWriteQuery(sql)).toThrow(TypeError);
  });
});
