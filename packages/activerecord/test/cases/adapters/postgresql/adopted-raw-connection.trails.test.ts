import { it, expect, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_CONFIG } from "./test-helper.js";
import { deprecator } from "../../../../lib/deprecator.js";
import { Connection } from "@blazetrails/pg";

describeIfPg("PostgreSQLAdapter adopts a raw connection it was handed (trails)", () => {
  it("runs a statement on the pg.Client the caller built", async () => {
    const { database: dbname, username: user, ...rest } = PG_TEST_CONFIG;
    const client = await Connection.connect({ ...rest, dbname, user });
    const warn = vi.spyOn(deprecator(), "warn").mockImplementation(() => undefined);
    const adapter = new PostgreSQLAdapter(client);
    warn.mockRestore();
    try {
      expect(await adapter.selectValue("SELECT 1")).toBe(1);
      expect(await adapter.active()).toBe(true);
      await adapter.verifyBang();
      expect(await adapter.selectValue("SELECT 2")).toBe(2);
      const raw = (adapter as unknown as { _rawConnection: unknown })._rawConnection;
      expect(raw).toBe(client);
    } finally {
      await adapter.disconnectBang();
    }
  });
});
