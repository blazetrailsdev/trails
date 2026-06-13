/**
 * Mirrors the PostgreSQL-gated probes of Rails
 * activerecord/test/cases/adapter_test.rb: the shared `current_database` case
 * (gated by `@connection.respond_to?(:current_database)`, which PG satisfies)
 * and `AdvisoryLocksEnabledTest` (gated by `supports_advisory_locks?`). SQLite
 * is excluded by those gates; here the suite is behind `describeIfPg`, which is
 * `describe.skip` when PG_TEST_URL is absent.
 */
import { it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

describeIfPg("AdapterTest", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(() => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  it("current database", async () => {
    expect(await adapter.currentDatabase()).toBe(databaseName(PG_TEST_URL));
  });
});

describeIfPg("AdvisoryLocksEnabledTest", () => {
  it("advisory locks enabled?", async () => {
    const base = new PostgreSQLAdapter(PG_TEST_URL);
    try {
      expect(base.isAdvisoryLocksEnabled()).toBe(true);
    } finally {
      await base.close();
    }

    const disabled = new PostgreSQLAdapter({
      connectionString: PG_TEST_URL,
      advisoryLocks: false,
    });
    try {
      expect(disabled.isAdvisoryLocksEnabled()).toBe(false);
    } finally {
      await disabled.close();
    }

    const enabled = new PostgreSQLAdapter({
      connectionString: PG_TEST_URL,
      advisoryLocks: true,
    });
    try {
      expect(enabled.isAdvisoryLocksEnabled()).toBe(true);
    } finally {
      await enabled.close();
    }
  });
});
