import { describe, it, expect, vi } from "vitest";
import { SchemaStatements } from "./schema-statements.js";

// Rails has no test for `assume_migrated_upto_version`, but it is the
// production path behind `ActiveRecord::Schema#define` (schema.ts:98), so the
// three behaviours it encodes — the duplicate-check scope, the `detect`/`count`
// selection, and the reversed single INSERT from `insert_versions_sql` — are
// pinned here against schema_statements.rb:1364-1384 and :1881-1884.
function makeStatements(options: { migrated?: number[]; versions?: number[] } = {}) {
  const executed: string[] = [];
  const adapter = {
    adapterName: "sqlite" as const,
    quoteIdentifier: (n: string) => `"${n}"`,
    quoteTableName: (n: string) => `"${n}"`,
    quote: (v: unknown) => (typeof v === "number" ? String(v) : `'${String(v)}'`),
    execute: vi.fn(async (sql: string) => {
      executed.push(sql);
      return [];
    }),
    pool: {
      schemaMigration: { tableName: "schema_migrations" },
      migrationContext: {
        getAllVersions: async () => options.migrated ?? [],
        migrations: (options.versions ?? []).map((version) => ({ version })),
      },
    },
    config: {},
  };
  const ss = new SchemaStatements(
    adapter as unknown as ConstructorParameters<typeof SchemaStatements>[0],
  );
  return { ss, executed };
}

describe("SchemaStatements#assumeMigratedUptoVersion", () => {
  it("inserts the target version when it has not been migrated", async () => {
    const { ss, executed } = makeStatements({ migrated: [], versions: [] });
    await ss.assumeMigratedUptoVersion(20240101000000);
    expect(executed).toEqual(['INSERT INTO "schema_migrations" (version) VALUES (20240101000000)']);
  });

  it("does not insert the target version when it is already migrated", async () => {
    const { ss, executed } = makeStatements({
      migrated: [20240101000000],
      versions: [20240101000000],
    });
    await ss.assumeMigratedUptoVersion(20240101000000);
    expect(executed).toEqual([]);
  });

  it("backfills only the known migrations below the target version", async () => {
    const { ss, executed } = makeStatements({
      migrated: [20240101000000],
      versions: [1, 2, 20240101000000, 20250101000000],
    });
    await ss.assumeMigratedUptoVersion(20240101000000);
    // Only the backfill statement runs: the target is already migrated, and
    // the later migration is excluded by `select { |v| v < version }`.
    expect(executed).toEqual(['INSERT INTO "schema_migrations" (version) VALUES\n(2),\n(1);']);
  });

  it("emits both statements newline-joined with the tuples reversed and a trailing semicolon", async () => {
    const { ss, executed } = makeStatements({ migrated: [], versions: [1, 2, 3] });
    await ss.assumeMigratedUptoVersion(3);
    expect(executed).toEqual([
      'INSERT INTO "schema_migrations" (version) VALUES (3)',
      'INSERT INTO "schema_migrations" (version) VALUES\n(2),\n(1);',
    ]);
  });

  it("excludes already-migrated versions from the backfill", async () => {
    const { ss, executed } = makeStatements({ migrated: [1], versions: [1, 2, 3] });
    await ss.assumeMigratedUptoVersion(3);
    expect(executed).toEqual([
      'INSERT INTO "schema_migrations" (version) VALUES (3)',
      'INSERT INTO "schema_migrations" (version) VALUES\n(2);',
    ]);
  });

  it("raises on a duplicate migration version", async () => {
    const { ss } = makeStatements({ migrated: [], versions: [1, 1, 3] });
    await expect(ss.assumeMigratedUptoVersion(3)).rejects.toThrow(
      "Duplicate migration 1. Please renumber your migrations to resolve the conflict.",
    );
  });

  it("cites the first repeating version in `inserting` order", async () => {
    // `detect { |v| inserting.count(v) > 1 }` scans in order, so [B, A, A, B]
    // cites B — a first-adjacent-pair scan would wrongly cite A.
    const { ss } = makeStatements({ migrated: [], versions: [7, 5, 5, 7, 9] });
    await expect(ss.assumeMigratedUptoVersion(9)).rejects.toThrow("Duplicate migration 7.");
  });

  it("ignores duplicates that are outside the backfill scope", async () => {
    // The duplicate check runs on `inserting`, not on all known versions: both
    // an already-migrated pair and a pair above the target must pass.
    const { ss, executed } = makeStatements({ migrated: [1], versions: [1, 1, 2, 9, 9] });
    await ss.assumeMigratedUptoVersion(3);
    expect(executed).toEqual([
      'INSERT INTO "schema_migrations" (version) VALUES (3)',
      'INSERT INTO "schema_migrations" (version) VALUES\n(2);',
    ]);
  });
});
