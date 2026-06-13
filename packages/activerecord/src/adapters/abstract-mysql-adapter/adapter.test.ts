/**
 * Mirrors the MySQL-gated probes of Rails
 * activerecord/test/cases/adapter_test.rb (the `AdapterTest` cases wrapped in
 * `current_adapter?(:Mysql2Adapter, :TrilogyAdapter)` plus the shared
 * `current_database` case). SQLite skips these via the respond_to?/
 * current_adapter? gate — here the whole suite is gated behind
 * `describeIfMysql`, which is `describe.skip` when MYSQL_TEST_URL is absent.
 */
import { it, expect, beforeEach, afterEach } from "vitest";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";

function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

describeIfMysql("AdapterTest", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  it("current database", async () => {
    expect(await adapter.currentDatabase()).toBe(databaseName(MYSQL_TEST_URL));
  });

  it("charset", async () => {
    expect(await adapter.charset()).not.toBeNull();
    expect(await adapter.charset()).not.toBe("character_set_database");
    expect(await adapter.charset()).toBe(await adapter.showVariable("character_set_database"));
  });

  it("show nonexistent variable returns nil", async () => {
    expect(await adapter.showVariable("foo_bar_baz")).toBeNull();
  });

  it("not specifying database name for cross database selects", async () => {
    const db1 = "cross_db_select_1";
    const db2 = "cross_db_select_2";
    await adapter.execute(`DROP DATABASE IF EXISTS ${db1}`);
    await adapter.execute(`DROP DATABASE IF EXISTS ${db2}`);
    await adapter.execute(`CREATE DATABASE ${db1}`);
    await adapter.execute(`CREATE DATABASE ${db2}`);
    await adapter.execute(`CREATE TABLE ${db1}.pirates (id INT PRIMARY KEY)`);
    await adapter.execute(`CREATE TABLE ${db2}.courses (id INT PRIMARY KEY)`);

    // Mirrors Rails establishing a connection with the `:database` key removed:
    // a cross-database select must succeed without a default database set.
    const noDbUrl = new URL(MYSQL_TEST_URL);
    noDbUrl.pathname = "/";
    const noDbAdapter = new Mysql2Adapter(noDbUrl.toString());
    try {
      // assert_nothing_raised: the select resolves without throwing.
      await noDbAdapter.execute(
        `SELECT ${db1}.pirates.*, ${db2}.courses.* FROM ${db1}.pirates, ${db2}.courses`,
      );
    } finally {
      await noDbAdapter.close();
      await adapter.execute(`DROP DATABASE IF EXISTS ${db1}`);
      await adapter.execute(`DROP DATABASE IF EXISTS ${db2}`);
    }
  });
});

describeIfMysql("AdvisoryLocksEnabledTest", () => {
  it("advisory locks enabled?", async () => {
    const base = new Mysql2Adapter(MYSQL_TEST_URL);
    try {
      expect(base.isAdvisoryLocksEnabled()).toBe(true);
    } finally {
      await base.close();
    }

    const disabled = new Mysql2Adapter({ uri: MYSQL_TEST_URL, advisoryLocks: false });
    try {
      expect(disabled.isAdvisoryLocksEnabled()).toBe(false);
    } finally {
      await disabled.close();
    }

    const enabled = new Mysql2Adapter({ uri: MYSQL_TEST_URL, advisoryLocks: true });
    try {
      expect(enabled.isAdvisoryLocksEnabled()).toBe(true);
    } finally {
      await enabled.close();
    }
  });
});
