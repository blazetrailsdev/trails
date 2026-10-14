import { it, expect, vi } from "vitest";
import mysql from "mysql2/promise";
import {
  describeIfMysqlAdapter,
  Mysql2Adapter,
  MYSQL_TEST_URL,
} from "../abstract-mysql-adapter/test-helper.js";
import { deprecator } from "../../deprecator.js";
import { mysql2Client } from "../../mysql2/client.js";

describeIfMysqlAdapter("Mysql2Adapter adopts a raw connection it was handed (trails)", () => {
  it("runs a statement on the client the caller built", async () => {
    const client = await mysql.createConnection(MYSQL_TEST_URL);
    const warn = vi.spyOn(deprecator(), "warn").mockImplementation(() => undefined);
    const adapter = new Mysql2Adapter(mysql2Client(client));
    warn.mockRestore();
    try {
      expect(Number(await adapter.selectValue("SELECT 1"))).toBe(1);
      expect(await adapter.active()).toBe(true);
      await adapter.verifyBang();
      expect(Number(await adapter.selectValue("SELECT 2"))).toBe(2);
      expect(adapter._rawConnection).toBe(client);
    } finally {
      await adapter.disconnectBang();
    }
  });
});
