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
