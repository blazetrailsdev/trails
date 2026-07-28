/**
 * trails-only coverage for `SchemaMigration#assumeMigratedUptoVersion`.
 * vendor/rails/activerecord/test/cases has no test for
 * `assume_migrated_upto_version` (schema_statements.rb:1364-1383), and trails'
 * SchemaMigration-level wrapper has no Rails counterpart, so these cases have no
 * Rails test to mirror verbatim.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { MockInstance } from "vitest";

import { Base } from "./index.js";
import { SchemaMigration } from "./schema-migration.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { fixtures } from "./test-fixtures.js";

describe("SchemaMigration#assumeMigratedUptoVersion (trails)", () => {
  fixtures([], { useTransactionalTests: false });

  let conn: DatabaseAdapter;
  let schemaMigration: SchemaMigration;
  let originalPrefix: string;
  let executeSpy: MockInstance<DatabaseAdapter["execute"]>;

  beforeAll(async () => {
    // An isolated table, so this suite never reads or writes the
    // schema_migrations rows every other suite shares.
    originalPrefix = Base.tableNamePrefix;
    Base.tableNamePrefix = "amuv_";
    conn = (await Base.leaseConnection()) as unknown as DatabaseAdapter;
    schemaMigration = new SchemaMigration(conn);
    await schemaMigration.dropTable();
    await schemaMigration.createTable();
    executeSpy = vi.spyOn(conn, "execute") as unknown as MockInstance<DatabaseAdapter["execute"]>;
  });

  afterAll(async () => {
    executeSpy.mockRestore();
    await schemaMigration.dropTable();
    Base.tableNamePrefix = originalPrefix;
  });

  beforeEach(async () => {
    await schemaMigration.deleteAllVersions();
    executeSpy.mockClear();
  });

  function insertStatements(): string[] {
    return executeSpy.mock.calls.map(([sql]) => String(sql)).filter((sql) => /^INSERT/i.test(sql));
  }

  it("inserts the version when it has not been migrated", async () => {
    await schemaMigration.assumeMigratedUptoVersion(20200101000000);

    expect(await schemaMigration.versions()).toEqual(["20200101000000"]);
  });

  it("does nothing when the version is already migrated", async () => {
    await schemaMigration.createVersion("20200101000000");
    executeSpy.mockClear();

    await schemaMigration.assumeMigratedUptoVersion(20200101000000);

    expect(insertStatements()).toEqual([]);
    expect(await schemaMigration.versions()).toEqual(["20200101000000"]);
  });

  it("inserts only migration versions below the given version", async () => {
    await schemaMigration.assumeMigratedUptoVersion(
      20200103000000,
      [20200101000000, 20200102000000, 20200104000000],
    );

    expect(await schemaMigration.versions()).toEqual([
      "20200101000000",
      "20200102000000",
      "20200103000000",
    ]);
  });

  it("does not re-insert already migrated intervening versions", async () => {
    await schemaMigration.createVersion("20200101000000");
    executeSpy.mockClear();

    await schemaMigration.assumeMigratedUptoVersion(
      20200103000000,
      [20200101000000, 20200102000000],
    );

    expect(insertStatements()).toHaveLength(2);
    expect(await schemaMigration.versions()).toEqual([
      "20200101000000",
      "20200102000000",
      "20200103000000",
    ]);
  });

  it("treats a zero-padded version as already migrated", async () => {
    await schemaMigration.createVersion("1");
    executeSpy.mockClear();

    await schemaMigration.assumeMigratedUptoVersion("001");

    expect(insertStatements()).toEqual([]);
    expect(await schemaMigration.versions()).toEqual(["1"]);
  });

  it("raises on a duplicate unmigrated version below the target", async () => {
    await expect(
      schemaMigration.assumeMigratedUptoVersion(20200103000000, [20200101000000, 20200101000000]),
    ).rejects.toThrow(
      "Duplicate migration 20200101000000. Please renumber your migrations to resolve the conflict.",
    );

    expect(insertStatements()).toEqual([]);
    expect(await schemaMigration.versions()).toEqual([]);
  });

  // Rails' `detect { |v| inserting.count(v) > 1 }` (schema_statements.rb:1377)
  // reports the first element that repeats, not the first repeat encountered:
  // for [B, A, A, B] it cites B, reached at index 0, even though A's second
  // occurrence comes first.
  it("cites the first repeating version when two versions repeat", async () => {
    await expect(
      schemaMigration.assumeMigratedUptoVersion(
        20200103000000,
        [20200102000000, 20200101000000, 20200101000000, 20200102000000],
      ),
    ).rejects.toThrow(
      "Duplicate migration 20200102000000. Please renumber your migrations to resolve the conflict.",
    );

    expect(insertStatements()).toEqual([]);
    expect(await schemaMigration.versions()).toEqual([]);
  });

  // Rails builds the duplicate check from `inserting`, not from every supplied
  // version (schema_statements.rb:1375-1379), so an already-migrated repeat is
  // subtracted out before the check ever sees it.
  it("accepts a duplicate version that is already migrated", async () => {
    await schemaMigration.createVersion("20200101000000");
    executeSpy.mockClear();

    await schemaMigration.assumeMigratedUptoVersion(
      20200103000000,
      [20200101000000, 20200101000000],
    );

    expect(await schemaMigration.versions()).toEqual(["20200101000000", "20200103000000"]);
  });

  it("accepts a duplicate version at or above the target", async () => {
    await schemaMigration.assumeMigratedUptoVersion(
      20200103000000,
      [20200104000000, 20200104000000],
    );

    expect(await schemaMigration.versions()).toEqual(["20200103000000"]);
  });

  it("raises on a non-numeric version without inserting", async () => {
    await expect(schemaMigration.assumeMigratedUptoVersion("nope")).rejects.toThrow(
      "Invalid migration version: nope",
    );

    expect(insertStatements()).toEqual([]);
    expect(await schemaMigration.versions()).toEqual([]);
  });

  it("raises on a non-numeric migration version without inserting", async () => {
    await expect(
      schemaMigration.assumeMigratedUptoVersion(20200103000000, [20200101000000, "oops"]),
    ).rejects.toThrow("Invalid migration version: oops");

    expect(insertStatements()).toEqual([]);
    expect(await schemaMigration.versions()).toEqual([]);
  });

  // Rails emits up to two statements: the target version on its own
  // (schema_statements.rb:1372-1374), then `insert_versions_sql(inserting)`,
  // which reverses the tuples (schema_statements.rb:1882). Only the SQL text
  // differs here — Rails newline-joins the tuples and appends a `;`.
  it("emits the target INSERT then a reversed multi-row INSERT", async () => {
    await schemaMigration.assumeMigratedUptoVersion(
      20200103000000,
      [20200101000000, 20200102000000],
    );

    const table = conn.quoteTableName(schemaMigration.tableName);
    const column = conn.quoteColumnName(schemaMigration.primaryKey);
    expect(insertStatements()).toEqual([
      `INSERT INTO ${table} (${column}) VALUES ('20200103000000')`,
      `INSERT INTO ${table} (${column}) VALUES ('20200102000000'), ('20200101000000')`,
    ]);
  });

  it("emits only the backfill INSERT when the target is already migrated", async () => {
    await schemaMigration.createVersion("20200103000000");
    executeSpy.mockClear();

    await schemaMigration.assumeMigratedUptoVersion(
      20200103000000,
      [20200101000000, 20200102000000],
    );

    const table = conn.quoteTableName(schemaMigration.tableName);
    const column = conn.quoteColumnName(schemaMigration.primaryKey);
    expect(insertStatements()).toEqual([
      `INSERT INTO ${table} (${column}) VALUES ('20200102000000'), ('20200101000000')`,
    ]);
  });
});
