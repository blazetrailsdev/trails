import { it, expect, vi } from "vitest";
import pg from "pg";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { deprecator } from "../../deprecator.js";
import { pgConnection } from "../../pg/connection.js";

describeIfPg("PostgreSQLAdapter adopts a raw connection it was handed (trails)", () => {
  it("runs a statement on the pg.Client the caller built", async () => {
    const client = new pg.Client({ connectionString: PG_TEST_URL });
    await client.connect();
    const warn = vi.spyOn(deprecator(), "warn").mockImplementation(() => undefined);
    const adapter = new PostgreSQLAdapter(pgConnection(client));
    warn.mockRestore();
    try {
      expect(await adapter.selectValue("SELECT 1")).toBe(1);
      expect(await adapter.active()).toBe(true);
      await adapter.verifyBang();
      expect(await adapter.selectValue("SELECT 2")).toBe(2);
      const raw = (adapter as unknown as { _rawConnection: { client: unknown } })._rawConnection;
      expect(raw.client).toBe(client);
    } finally {
      await adapter.disconnectBang();
    }
  });
});
