import { describe, it, beforeEach, expect } from "vitest";
import { describeIfMysqlAdapter, leaseMysqlAdapter, Mysql2Adapter } from "./test-helper.js";

describeIfMysqlAdapter("AbstractMysqlAdapter#showVariable", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
  });

  describe("scoped variable references", () => {
    it("resolves a @@global. reference rather than rejecting the name", async () => {
      expect(await adapter.showVariable("global.max_connections")).not.toBeNull();
    });

    it("resolves a @@session. reference rather than rejecting the name", async () => {
      expect(await adapter.showVariable("session.sql_mode")).not.toBeNull();
    });
  });
});
