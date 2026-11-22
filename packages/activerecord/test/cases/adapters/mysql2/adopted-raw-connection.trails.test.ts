import { describe, it, expect, vi } from "vitest";
import { Mysql2Adapter, MYSQL_TEST_URL } from "../abstract-mysql-adapter/test-helper.js";
import { deprecator } from "../../../../lib/deprecator.js";
import { Mysql2 } from "@blazetrails/mysql2";
import { currentAdapter } from "../../../support/adapter-helper.js";

describe.runIf(currentAdapter("Mysql2Adapter"))(
  "Mysql2Adapter adopts a raw connection it was handed (trails)",
  () => {
    it("runs a statement on the client the caller built", async () => {
      const client = await Mysql2.Client.new({ uri: MYSQL_TEST_URL });
      const warn = vi.spyOn(deprecator(), "warn").mockImplementation(() => undefined);
      const adapter = new Mysql2Adapter(client);
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
  },
);
