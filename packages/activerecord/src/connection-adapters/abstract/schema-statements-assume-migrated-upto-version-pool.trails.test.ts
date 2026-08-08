/**
 * `assume_migrated_upto_version` end to end against a REAL pool.
 *
 * The sibling `...-upto-version.trails.test.ts` pins the emitted SQL through a
 * stubbed `pool.migrationContext`; nothing there proves the object a live pool
 * hands back actually owns `getAllVersions` / `migrations`, nor that the paths
 * it discovers migrations from are its own rather than `Migrator`'s global
 * static. These cases go through `Base.connectionPool()` unstubbed.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "../../base.js";
import { Migrator } from "../../migration.js";
import { SchemaMigration } from "../../schema-migration.js";
import { fixtures } from "../../test-fixtures.js";

const migrationsDir = (name: string) =>
  new URL(`../../test-helpers/migrations/${name}`, import.meta.url).pathname;

// versions 1, 2, 3
const VALID = migrationsDir("valid");
// versions 230, 231, 20210716122844, 20210716123013
const OLD_AND_NEW_VERSIONS = migrationsDir("old_and_new_versions");

/** `assumeMigratedUptoVersion` is mixed onto the adapter by `SchemaStatements`. */
const assumeMigratedUptoVersion = (version: number) =>
  (
    Base.connection as unknown as {
      assumeMigratedUptoVersion(v: number): Promise<void>;
    }
  ).assumeMigratedUptoVersion(version);

/**
 * `DatabaseConfig#migrationsPaths` is a reader over a frozen configuration
 * hash, so shadow the reader and drop the pool's memoized context — which,
 * like Rails, captures its paths at construction.
 */
function pointPoolAt(paths: string[]): () => void {
  const pool = Base.connectionPool();
  const dbConfig = pool.dbConfig as unknown as object;
  const previous = Object.getOwnPropertyDescriptor(dbConfig, "migrationsPaths");
  const dropMemo = () =>
    delete (pool as unknown as { _migrationContext?: unknown })._migrationContext;
  Object.defineProperty(dbConfig, "migrationsPaths", { configurable: true, get: () => paths });
  dropMemo();
  return () => {
    if (previous) Object.defineProperty(dbConfig, "migrationsPaths", previous);
    else delete (dbConfig as Record<string, unknown>).migrationsPaths;
    dropMemo();
  };
}

describe("SchemaStatements#assumeMigratedUptoVersion", () => {
  fixtures({}, { useTransactionalTests: false });

  let restore: () => void;
  let previousGlobalPaths: string[];

  beforeEach(async () => {
    restore = pointPoolAt([VALID]);
    previousGlobalPaths = Migrator.migrationsPaths;
    Migrator.migrationsPaths = [OLD_AND_NEW_VERSIONS];
    await new SchemaMigration(Base.connection.pool).dropTable();
    await new SchemaMigration(Base.connection.pool).createTable();
  });

  afterEach(() => {
    Migrator.migrationsPaths = previousGlobalPaths;
    restore();
  });

  it("backfills every known version up to the target through the pool's migration context", async () => {
    await assumeMigratedUptoVersion(3);
    expect(await new SchemaMigration(Base.connection.pool).integerVersions()).toEqual([1, 2, 3]);
  });

  it("does not re-insert a version the schema_migrations table already holds", async () => {
    const schemaMigration = Base.connectionPool().schemaMigration;
    await schemaMigration.createVersion("3");
    await assumeMigratedUptoVersion(3);
    expect(await schemaMigration.integerVersions()).toEqual([1, 2, 3]);
  });

  it("discovers migrations from the paths its own pool was built with", async () => {
    const context = Base.connectionPool().migrationContext;
    expect(context.migrationsPaths).toEqual([VALID]);
    expect(context.migrations.map((m) => Number(m.version))).toEqual([1, 2, 3]);
  });

  it("reports the versions stored in the pool's schema_migrations table", async () => {
    await Base.connectionPool().schemaMigration.createVersion("2");
    expect(await Base.connectionPool().migrationContext.getAllVersions()).toEqual([2]);
    expect(await Base.connectionPool().migrationContext.currentVersion()).toBe(2);
  });

  it("reports no applied versions when schema_migrations does not exist", async () => {
    await new SchemaMigration(Base.connection.pool).dropTable();
    expect(await Base.connectionPool().migrationContext.getAllVersions()).toEqual([]);
    expect(await Base.connectionPool().migrationContext.currentVersion()).toBe(0);
  });
});
