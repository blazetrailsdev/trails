import { currentAdapter } from "../../../support/adapter-helper.js";
import { describe, it, beforeEach, expect } from "vitest";
import { leaseMysqlAdapter, Mysql2Adapter } from "./test-helper.js";

describe.runIf(currentAdapter("Mysql2Adapter"))("AbstractMysqlAdapter#showVariable", () => {
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
