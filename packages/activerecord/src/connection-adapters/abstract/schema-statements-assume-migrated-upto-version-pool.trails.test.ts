import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "../../base.js";
import { Migrator } from "../../migration.js";
import { SchemaMigration } from "../../schema-migration.js";
import { fixtures } from "../../test-fixtures.js";

const migrationsDir = (name: string) =>
  new URL(`../../test-helpers/migrations/${name}`, import.meta.url).pathname;

const VALID = migrationsDir("valid");
const OLD_AND_NEW_VERSIONS = migrationsDir("old_and_new_versions");

const assumeMigratedUptoVersion = (version: number) =>
  (
    Base.connection as unknown as {
      assumeMigratedUptoVersion(v: number): Promise<void>;
    }
  ).assumeMigratedUptoVersion(version);

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
