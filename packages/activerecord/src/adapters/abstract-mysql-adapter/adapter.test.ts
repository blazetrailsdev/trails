/**
 * Mirrors the MySQL-gated probes of Rails
 * activerecord/test/cases/adapter_test.rb (the `AdapterTest` cases wrapped in
 * `current_adapter?(:Mysql2Adapter, :TrilogyAdapter)` plus the shared
 * `current_database` case). SQLite skips these via the respond_to?/
 * current_adapter? gate — here the whole suite is gated behind
 * `describeIfMysql`, which is `describe.skip` when MYSQL_TEST_URL is absent.
 */
import { it, expect, beforeEach, afterEach } from "vitest";
import {
  describeIfMysql,
  Mysql2Adapter,
  MYSQL_TEST_URL,
  databaseName,
  ARUNIT_DATABASE,
  ARUNIT2_DATABASE,
} from "./test-helper.js";

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
    // Rails' assert_not_nil; charset() collapses null → "" (the ?? "" fallback),
    // so the not-nil intent maps to non-empty here.
    expect(await adapter.charset()).not.toBe("");
    expect(await adapter.charset()).not.toBe("character_set_database");
    expect(await adapter.charset()).toBe(await adapter.showVariable("character_set_database"));
  });

  it("collation", async () => {
    expect(await adapter.collation()).not.toBe("");
    expect(await adapter.collation()).not.toBe("collation_database");
    expect(await adapter.collation()).toBe(await adapter.showVariable("collation_database"));
  });

  it("show nonexistent variable returns nil", async () => {
    expect(await adapter.showVariable("foo_bar_baz")).toBeNull();
  });

  it("not specifying database name for cross database selects", async () => {
    // Rails reads `arunit`/`arunit2` from `ARTest.test_configuration_hashes`
    // and selects `arunit.pirates` joined with `arunit2.courses`. We mirror
    // that two-database layout with the config-derived `ARUNIT_DATABASE` /
    // `ARUNIT2_DATABASE` names (see test-helper), seeding `pirates` in the
    // first and `courses` in the second using their canonical columns.
    await adapter.execute(`DROP DATABASE IF EXISTS ${ARUNIT_DATABASE}`);
    await adapter.execute(`DROP DATABASE IF EXISTS ${ARUNIT2_DATABASE}`);
    await adapter.execute(`CREATE DATABASE ${ARUNIT_DATABASE}`);
    await adapter.execute(`CREATE DATABASE ${ARUNIT2_DATABASE}`);
    await adapter.execute(
      `CREATE TABLE ${ARUNIT_DATABASE}.pirates (id INT AUTO_INCREMENT PRIMARY KEY, catchphrase VARCHAR(255), parrot_id INT, non_validated_parrot_id INT)`,
    );
    await adapter.execute(
      `CREATE TABLE ${ARUNIT2_DATABASE}.courses (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, college_id INT)`,
    );

    // Mirrors Rails establishing a connection with the `:database` key removed:
    // a cross-database select must succeed without a default database set.
    const noDbUrl = new URL(MYSQL_TEST_URL);
    noDbUrl.pathname = "/";
    const noDbAdapter = new Mysql2Adapter(noDbUrl.toString());
    try {
      // assert_nothing_raised: the select resolves without throwing.
      await noDbAdapter.execute(
        `SELECT ${ARUNIT_DATABASE}.pirates.*, ${ARUNIT2_DATABASE}.courses.* ` +
          `FROM ${ARUNIT_DATABASE}.pirates, ${ARUNIT2_DATABASE}.courses`,
      );
    } finally {
      await noDbAdapter.close();
      await adapter.execute(`DROP DATABASE IF EXISTS ${ARUNIT_DATABASE}`);
      await adapter.execute(`DROP DATABASE IF EXISTS ${ARUNIT2_DATABASE}`);
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
