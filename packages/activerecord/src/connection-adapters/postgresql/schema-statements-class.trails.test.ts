import { describe, expect, it, vi } from "vitest";
import { PostgreSQLSchemaStatements } from "./schema-statements-class.js";
import type { AbstractAdapter as DatabaseAdapter } from "../abstract-adapter.js";

function makeAdapter(logger?: { warn: (msg: string) => void }) {
  return {
    adapterName: "postgres" as const,
    logger: logger ?? null,
    quote: (v: unknown) => `'${String(v).replace(/'/g, "''")}'`,
    quoteColumnName: (n: string) => `"${n}"`,
    quoteTableName: (n: string) => `"${n}"`,
    queryValue: vi.fn(async () => null),
    getDatabaseVersion: vi.fn(async () => 160000),
  } as unknown as DatabaseAdapter;
}

// Expected digests are the literals Rails asserts in
// migration/exclusion_constraint_test.rb and migration/unique_constraint_test.rb,
// so drift in the identifier shape or digest slice fails here rather than
// silently changing emitted DDL and dumped schema.
describe("PostgreSQLSchemaStatements constraint name digests", () => {
  it("derives the exclusion constraint name Rails derives", () => {
    const ss = new PostgreSQLSchemaStatements(makeAdapter());
    expect(
      ss.exclusionConstraintName("invoices", {
        expression: "daterange(start_date, end_date) WITH &&",
      }),
    ).toBe("excl_rails_74c9160f55");
  });

  it("derives the unique constraint name Rails derives from a column list", () => {
    const ss = new PostgreSQLSchemaStatements(makeAdapter());
    expect(ss.uniqueConstraintName("sections", { column: ["position"] })).toBe(
      "uniq_rails_1e07660b77",
    );
  });

  it("derives the unique constraint name Rails derives from usingIndex", () => {
    const ss = new PostgreSQLSchemaStatements(makeAdapter());
    expect(ss.uniqueConstraintName("sections", { usingIndex: "unique_index" })).toBe(
      "uniq_rails_79b901ffb4",
    );
  });

  it("returns an explicit :name option unchanged", () => {
    const ss = new PostgreSQLSchemaStatements(makeAdapter());
    expect(ss.exclusionConstraintName("invoices", { name: "my_excl", expression: "x" })).toBe(
      "my_excl",
    );
    expect(ss.uniqueConstraintName("sections", { name: "my_uniq", column: ["position"] })).toBe(
      "my_uniq",
    );
  });
});

describe("PostgreSQLSchemaStatements sequence helpers warn without a sequence", () => {
  it("setPkSequenceBang warns when the table has a primary key but no sequence", async () => {
    const warn = vi.fn();
    const ss = new PostgreSQLSchemaStatements(makeAdapter({ warn }));
    vi.spyOn(ss, "pkAndSequenceFor").mockResolvedValue(["id", null]);
    await ss.setPkSequenceBang("postgresql_uuids", 42);
    expect(warn).toHaveBeenCalledWith(
      "postgresql_uuids has primary key id with no default sequence.",
    );
  });

  it("resetPkSequenceBang warns when the table has a primary key but no sequence", async () => {
    const warn = vi.fn();
    const ss = new PostgreSQLSchemaStatements(makeAdapter({ warn }));
    vi.spyOn(ss, "pkAndSequenceFor").mockResolvedValue(["id", null]);
    await ss.resetPkSequenceBang("postgresql_uuids");
    expect(warn).toHaveBeenCalledWith(
      "postgresql_uuids has primary key id with no default sequence.",
    );
  });

  it("stays silent when no logger is configured", async () => {
    const ss = new PostgreSQLSchemaStatements(makeAdapter());
    vi.spyOn(ss, "pkAndSequenceFor").mockResolvedValue(["id", null]);
    await expect(ss.setPkSequenceBang("postgresql_uuids", 42)).resolves.toBeUndefined();
  });

  it("does not warn when the table has no primary key at all", async () => {
    const warn = vi.fn();
    const ss = new PostgreSQLSchemaStatements(makeAdapter({ warn }));
    vi.spyOn(ss, "pkAndSequenceFor").mockResolvedValue(null);
    await ss.setPkSequenceBang("postgresql_uuids", 42);
    expect(warn).not.toHaveBeenCalled();
  });
});
