import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Time as RubyTime } from "@blazetrails/date";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL });
  });
  afterEach(async () => {
    await adapter.disconnectBang();
  });

  describe("QuotingTest", () => {
    it("quote date", async () => {
      const rows = await adapter.execute("SELECT DATE '2023-01-15' AS val");
      expect(rows[0].val).toBe("2023-01-15");
    });

    it("quote time", async () => {
      const rows = await adapter.execute("SELECT TIME '14:30:00' AS val");
      expect(rows[0].val).toBe("14:30:00");
    });

    it("quote timestamp", async () => {
      const rows = await adapter.execute("SELECT TIMESTAMP '2023-01-15 14:30:00' AS val");
      const val = rows[0].val as RubyTime;
      expect(val).toBeInstanceOf(RubyTime);
      expect(val.getutc().year).toBe(2023);
    });

    it("quote array", async () => {
      const rows = await adapter.execute("SELECT ARRAY[1,2,3]::integer[] AS val");
      expect(rows[0].val).toEqual([1, 2, 3]);
    });
  });
});
