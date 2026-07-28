/**
 * trails-only coverage for `SchemaMigration#assumeMigratedUptoVersion` —
 * vendor/rails/activerecord/test/cases has no test for
 * `assume_migrated_upto_version` (schema_statements.rb:1364-1383), and trails'
 * SchemaMigration-level wrapper has no Rails counterpart at all, so these cases
 * have no Rails test to mirror verbatim.
 *
 * The method had zero coverage, which let a latent break ship: rows were built
 * as `[new Nodes.Quoted(v)]`, and once the ValuesList visitor was narrowed to
 * Rails' `case` (to_sql.rb:110) a `Quoted` row fell through to `quote()`, which
 * raises `TypeError: can't quote Quoted`. The SQL-shape assertion below pins the
 * row shape so that regression fails loudly instead of only at runtime.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import { Base } from "./index.js";
import { SchemaMigration } from "./schema-migration.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { fixtures } from "./test-helpers/fixtures.js";

describe("SchemaMigration#assumeMigratedUptoVersion (trails)", () => {
  // Real DDL against a real adapter: run non-transactionally so MySQL's
  // implicit commit on DDL cannot commit the fixture transaction mid-test.
  fixtures([], { useTransactionalTests: false });

  let conn: DatabaseAdapter;
  let schemaMigration: SchemaMigration;
  let originalPrefix: string;
  let executed: string[] = [];

  beforeAll(async () => {
    // An isolated table, so this suite never reads or writes the real
    // schema_migrations rows other suites share.
    originalPrefix = Base.tableNamePrefix;
    Base.tableNamePrefix = "amuv_";
    conn = (await Base.leaseConnection()) as unknown as DatabaseAdapter;
    schemaMigration = new SchemaMigration(conn);
    await schemaMigration.dropTable();
    await schemaMigration.createTable();

    const host = conn as unknown as { execute(sql: string): Promise<unknown> };
    const original = host.execute.bind(conn);
    host.execute = (sql: string) => {
      executed.push(sql);
      return original(sql);
    };
  });

  afterAll(async () => {
    delete (conn as unknown as { execute?: unknown }).execute;
    await schemaMigration.dropTable();
    Base.tableNamePrefix = originalPrefix;
  });

  beforeEach(async () => {
    await schemaMigration.deleteAllVersions();
    executed = [];
  });

  function insertStatements(): string[] {
    return executed.filter((sql) => /^INSERT/i.test(sql));
  }

  it("inserts the version when it has not been migrated", async () => {
    await schemaMigration.assumeMigratedUptoVersion(20200101000000);

    expect(await schemaMigration.versions()).toEqual(["20200101000000"]);
  });

  it("does nothing when the version is already migrated", async () => {
    await schemaMigration.createVersion("20200101000000");
    executed = [];

    await schemaMigration.assumeMigratedUptoVersion(20200101000000);

    expect(insertStatements()).toEqual([]);
    expect(await schemaMigration.versions()).toEqual(["20200101000000"]);
  });

  it("backfills migration versions below the given version", async () => {
    await schemaMigration.assumeMigratedUptoVersion(
      20200103000000,
      [
        20200101000000, 20200102000000,
        // Above the ceiling — Rails selects only `v < version`
        // (schema_statements.rb:1375).
        20200104000000,
      ],
    );

    expect(await schemaMigration.versions()).toEqual([
      "20200101000000",
      "20200102000000",
      "20200103000000",
    ]);
  });

  it("does not re-insert already migrated intervening versions", async () => {
    await schemaMigration.createVersion("20200101000000");

    await schemaMigration.assumeMigratedUptoVersion(
      20200103000000,
      [20200101000000, 20200102000000],
    );

    expect(await schemaMigration.versions()).toEqual([
      "20200101000000",
      "20200102000000",
      "20200103000000",
    ]);
  });

  it("normalizes zero-padded versions against the migrated set", async () => {
    await schemaMigration.createVersion("1");

    await schemaMigration.assumeMigratedUptoVersion("001");

    expect(await schemaMigration.versions()).toEqual(["1"]);
  });

  // Rails: raise "Duplicate migration #{duplicate}. Please renumber your
  // migrations to resolve the conflict." (schema_statements.rb:1377-1379).
  it("raises on duplicate migration versions", async () => {
    await expect(
      schemaMigration.assumeMigratedUptoVersion(20200103000000, [20200101000000, 20200101000000]),
    ).rejects.toThrow(
      "Duplicate migration 20200101000000. Please renumber your migrations to resolve the conflict.",
    );

    // Validation runs before any write, so nothing was inserted.
    expect(insertStatements()).toEqual([]);
    expect(await schemaMigration.versions()).toEqual([]);
  });

  it("rejects a non-numeric version without writing", async () => {
    await expect(schemaMigration.assumeMigratedUptoVersion("nope")).rejects.toThrow(
      "Invalid migration version: nope",
    );
    expect(insertStatements()).toEqual([]);
  });

  it("emits a single multi-row INSERT with bare version values", async () => {
    await schemaMigration.assumeMigratedUptoVersion(
      20200103000000,
      [20200101000000, 20200102000000],
    );

    const table = conn.quoteTableName(schemaMigration.tableName);
    const column = conn.quoteColumnName(schemaMigration.primaryKey);
    expect(insertStatements()).toEqual([
      `INSERT INTO ${table} (${column}) VALUES ('20200103000000'), ('20200101000000'), ('20200102000000')`,
    ]);
  });
});
