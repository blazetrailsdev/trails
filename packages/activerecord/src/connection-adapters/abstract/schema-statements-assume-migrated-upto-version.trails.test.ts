import { describe, it, expect, vi } from "vitest";
import { SchemaStatements } from "./schema-statements.js";

function makeStatements(options: { migrated?: number[]; versions?: number[] } = {}) {
  const executed: string[] = [];
  const adapter = {
    adapterName: "sqlite" as const,
    quoteColumnName: (n: string) => `"${n}"`,
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
  // The bodies under test are prototype methods mixed into the adapter, so
  // give the fake adapter that prototype and call them the way production does.
  // `Object.setPrototypeOf` skips the AbstractAdapter constructor, which is what
  // seats `@config` (`abstract_adapter.rb:132`); `foreign_keys_enabled?` reads it
  // with `Hash#fetch`, so the shim has to seat it too.
  (adapter as unknown as { _config?: Record<string, unknown> })._config ??= {};
  const ss = Object.setPrototypeOf(adapter, SchemaStatements.prototype) as SchemaStatements;
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

  it("ignores duplicates that are outside the backfill scope", async () => {
    const { ss, executed } = makeStatements({ migrated: [1], versions: [1, 1, 2, 9, 9] });
    await ss.assumeMigratedUptoVersion(3);
    expect(executed).toEqual([
      'INSERT INTO "schema_migrations" (version) VALUES (3)',
      'INSERT INTO "schema_migrations" (version) VALUES\n(2);',
    ]);
  });
});
