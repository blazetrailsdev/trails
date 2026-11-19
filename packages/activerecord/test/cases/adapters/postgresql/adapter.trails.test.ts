import { it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL, PG_TEST_CONFIG } from "./test-helper.js";

function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

describeIfPg("AdapterTest", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(() => {
    adapter = new PostgreSQLAdapter({ ...PG_TEST_CONFIG });
  });
  afterEach(async () => {
    await adapter.disconnectBang();
  });

  it("current database", async () => {
    expect(await adapter.currentDatabase()).toBe(databaseName(PG_TEST_URL));
  });
});

describeIfPg("AdvisoryLocksEnabledTest", () => {
  it("advisory locks enabled?", async () => {
    const base = new PostgreSQLAdapter({ ...PG_TEST_CONFIG });
    try {
      expect(base.isAdvisoryLocksEnabled()).toBe(true);
    } finally {
      await base.disconnectBang();
    }

    const disabled = new PostgreSQLAdapter({
      ...PG_TEST_CONFIG,
      advisoryLocks: false,
    });
    try {
      expect(disabled.isAdvisoryLocksEnabled()).toBe(false);
    } finally {
      await disabled.disconnectBang();
    }

    const enabled = new PostgreSQLAdapter({
      ...PG_TEST_CONFIG,
      advisoryLocks: true,
    });
    try {
      expect(enabled.isAdvisoryLocksEnabled()).toBe(true);
    } finally {
      await enabled.disconnectBang();
    }
  });
});
