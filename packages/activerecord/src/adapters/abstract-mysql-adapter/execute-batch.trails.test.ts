import { describe, it, beforeEach, expect, vi } from "vitest";
import { describeIfMysqlAdapter, leaseMysqlAdapter, Mysql2Adapter } from "./test-helper.js";

describeIfMysqlAdapter("Mysql2Adapter#executeBatch", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
  });

  describe("combine_multi_statements", () => {
    it("sends the statements as one packet when they fit in max_allowed_packet", async () => {
      const rawExecute = vi.spyOn(adapter as never, "rawExecute").mockResolvedValue(undefined);
      let calls: unknown[][];
      try {
        await adapter.executeBatch(["SELECT 1", "SELECT 2"], "Batch");
      } finally {
        calls = rawExecute.mock.calls.slice();
        rawExecute.mockRestore();
      }

      expect(calls.map((call) => call[0])).toEqual(["SELECT 1;\nSELECT 2"]);
    });

    it("splits the statements against the server reported max_allowed_packet", async () => {
      const maxAllowedPacket = await adapter.maxAllowedPacket();
      expect(maxAllowedPacket).not.toBeNull();

      const filler = "x".repeat(Math.floor(maxAllowedPacket! / 2));
      const statements = [`SELECT '${filler}'`, `SELECT '${filler}'`, `SELECT '${filler}'`];

      const rawExecute = vi.spyOn(adapter as never, "rawExecute").mockResolvedValue(undefined);
      let calls: unknown[][];
      try {
        await adapter.executeBatch(statements, "Batch");
      } finally {
        calls = rawExecute.mock.calls.slice();
        rawExecute.mockRestore();
      }

      expect(calls.length).toBe(3);
      for (const [sql] of calls) {
        expect(String(sql).includes(";\n")).toBe(false);
      }
    });
  });
});
