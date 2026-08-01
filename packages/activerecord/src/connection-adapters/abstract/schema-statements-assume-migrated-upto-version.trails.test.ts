import { describe, it, expect, vi } from "vitest";
import { SchemaStatements } from "./schema-statements.js";

function makeStatements(
  options: { migrated?: Array<number | string>; versions?: Array<number | string> } = {},
) {
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

  it("coerces a string version with to_i semantics", async () => {
    const { ss, executed } = makeStatements({ migrated: [], versions: [1, 2] });
    await ss.assumeMigratedUptoVersion("3_foo");
    expect(executed).toEqual([
      'INSERT INTO "schema_migrations" (version) VALUES (3)',
      'INSERT INTO "schema_migrations" (version) VALUES\n(2),\n(1);',
    ]);
  });

  it("backfills only the known migrations below the target version", async () => {
    const { ss, executed } = makeStatements({
      migrated: [20240101000000],
      versions: [1, 2, 20240101000000, 20250101000000],
    });
    await ss.assumeMigratedUptoVersion(20240101000000);
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

  it("issues no backfill statement when nothing is left to insert", async () => {
    const { ss, executed } = makeStatements({ migrated: [1, 2, 3], versions: [1, 2, 3] });
    await ss.assumeMigratedUptoVersion(3);
    expect(executed).toEqual([]);
  });

  it("raises on a duplicate migration version", async () => {
    const { ss } = makeStatements({ migrated: [], versions: [1, 1, 3] });
    await expect(ss.assumeMigratedUptoVersion(3)).rejects.toThrow(
      "Duplicate migration 1. Please renumber your migrations to resolve the conflict.",
    );
  });

  it("cites the first repeating version in inserting order", async () => {
    const { ss } = makeStatements({ migrated: [], versions: [7, 5, 5, 7, 9] });
    await expect(ss.assumeMigratedUptoVersion(9)).rejects.toThrow("Duplicate migration 7.");
  });

  it("raises before issuing the backfill statement", async () => {
    const { ss, executed } = makeStatements({ migrated: [], versions: [1, 1, 3] });
    await expect(ss.assumeMigratedUptoVersion(3)).rejects.toThrow("Duplicate migration 1.");
    expect(executed).toEqual(['INSERT INTO "schema_migrations" (version) VALUES (3)']);
  });

  it("backfills string-typed migration versions below the target", async () => {
    const { ss, executed } = makeStatements({ migrated: [], versions: ["1", "2", "3"] });
    await ss.assumeMigratedUptoVersion(3);
    expect(executed).toEqual([
      'INSERT INTO "schema_migrations" (version) VALUES (3)',
      'INSERT INTO "schema_migrations" (version) VALUES\n(2),\n(1);',
    ]);
  });

  it("treats a string-typed migrated version as already migrated", async () => {
    const { ss, executed } = makeStatements({ migrated: ["3"], versions: ["3"] });
    await ss.assumeMigratedUptoVersion(3);
    expect(executed).toEqual([]);
  });

  it("excludes string-typed migrated versions from the backfill", async () => {
    const { ss, executed } = makeStatements({ migrated: ["1"], versions: ["1", "2", "3"] });
    await ss.assumeMigratedUptoVersion(3);
    expect(executed).toEqual([
      'INSERT INTO "schema_migrations" (version) VALUES (3)',
      'INSERT INTO "schema_migrations" (version) VALUES\n(2);',
    ]);
  });

  it("ignores duplicates that are outside the backfill scope", async () => {
    const { ss, executed } = makeStatements({ migrated: [1], versions: [1, 1, 2, 9, 9] });
    await ss.assumeMigratedUptoVersion(3);
    expect(executed).toEqual([
      'INSERT INTO "schema_migrations" (version) VALUES (3)',
      'INSERT INTO "schema_migrations" (version) VALUES\n(2);',
    ]);
  });
});
