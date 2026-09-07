import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    adapter.preparedStatements = true;
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await adapter.close();
  });

  describe("StatementPoolTest", () => {
    it("dealloc does not raise on inactive connection", async () => {
      await adapter.beginDbTransaction();
      await adapter.internalExecQuery("SELECT $1::int", "SQL", [1], { prepare: true });
      const pool = adapter._statements;
      await adapter.rollbackDbTransaction();
      await adapter.close();
      expect(() => pool.clear()).not.toThrow();
    });

    it("prepared statements do not get stuck on query interruption", async () => {
      await expect(
        adapter.internalExecQuery("SELECT 1 / $1::int", "SQL", [0], { prepare: true }),
      ).rejects.toThrow();
      const rows = (
        await adapter.internalExecQuery("SELECT 1 / $1::int", "SQL", [1], { prepare: true })
      ).toArray();
      expect(rows[0]).toBeDefined();
    });
  });
});
