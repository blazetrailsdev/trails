/**
 * `assume_migrated_upto_version` end to end against a REAL pool.
 *
 * The sibling `...-upto-version.trails.test.ts` pins the emitted SQL through a
 * stubbed `pool.migrationContext`; nothing there proves the object a live pool
 * hands back actually owns `getAllVersions` / `migrations`. These cases go
 * through `Base.connectionPool()` untouched, so a pool wired to something
 * without those members fails here.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "../../base.js";
import { SchemaMigration } from "../../schema-migration.js";
import { fixtures } from "../../test-fixtures.js";

// `assumeMigratedUptoVersion` is mixed onto the adapter from SchemaStatements,
// so it is not on the AbstractAdapter declaration.
const assumeMigratedUptoVersion = (version: number) =>
  (
    Base.connection as unknown as {
      assumeMigratedUptoVersion(v: number): Promise<void>;
    }
  ).assumeMigratedUptoVersion(version);

// The `valid` fixture directory holds versions 1, 2 and 3.
const VALID_MIGRATIONS = new URL("../../test-helpers/migrations/valid", import.meta.url).pathname;

describe("SchemaStatements#assumeMigratedUptoVersion", () => {
  fixtures({}, { useTransactionalTests: false });

  let restorePaths: () => void;

  beforeEach(async () => {
    const pool = Base.connectionPool();
    // `DatabaseConfig#migrationsPaths` is a reader over a frozen configuration
    // hash, so shadow the reader itself rather than the hash behind it. The
    // pool still builds its context the ordinary way.
    const dbConfig = pool.dbConfig as unknown as object;
    const previous = Object.getOwnPropertyDescriptor(dbConfig, "migrationsPaths");
    Object.defineProperty(dbConfig, "migrationsPaths", {
      configurable: true,
      get: () => [VALID_MIGRATIONS],
    });
    // The context memoizes its paths the way Rails' constructor does, so drop
    // the memo rather than mutating it in place.
    delete (pool as unknown as { _migrationContext?: unknown })._migrationContext;
    restorePaths = () => {
      if (previous) Object.defineProperty(dbConfig, "migrationsPaths", previous);
      else delete (dbConfig as Record<string, unknown>).migrationsPaths;
      delete (pool as unknown as { _migrationContext?: unknown })._migrationContext;
    };
    await new SchemaMigration(Base.connection).dropTable();
    await new SchemaMigration(Base.connection).createTable();
  });

  afterEach(() => {
    restorePaths();
  });

  it("backfills every known version up to the target through the pool's migration context", async () => {
    await assumeMigratedUptoVersion(3);
    expect(await new SchemaMigration(Base.connection).integerVersions()).toEqual([1, 2, 3]);
  });

  it("does not re-insert a version the schema_migrations table already holds", async () => {
    const schemaMigration = Base.connectionPool().schemaMigration;
    await schemaMigration.createVersion("3");
    await assumeMigratedUptoVersion(3);
    expect(await schemaMigration.integerVersions()).toEqual([1, 2, 3]);
  });

  it("reads the migrations paths of the pool that built the context, not a global list", async () => {
    const pool = Base.connectionPool();
    expect(pool.migrationContext.migrationsPaths).toEqual([VALID_MIGRATIONS]);
    expect(pool.migrationContext.migrations.map((m) => Number(m.version))).toEqual([1, 2, 3]);
  });

  it("reports the versions stored in the pool's schema_migrations table", async () => {
    await Base.connectionPool().schemaMigration.createVersion("2");
    expect(await Base.connectionPool().migrationContext.getAllVersions()).toEqual([2]);
    expect(await Base.connectionPool().migrationContext.currentVersion()).toBe(2);
  });
});
