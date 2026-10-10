import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfMysqlAdapter, leaseMysqlAdapter, Mysql2Adapter } from "./test-helper.js";
import { dumpTableSchema } from "../../support/schema-dumping-helper.js";

describeIfMysqlAdapter("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
    await adapter.createTable("set_tests", { id: false, force: true }, (t: any) => {
      t.column("set_column", "set('text','blob','tiny','medium','long','unsigned','bigint')");
    });
  });
  afterEach(async () => {
    await adapter.dropTable("set_tests", { ifExists: true });
  });

  describe("SetTest", () => {
    it("should not be unsigned", async () => {
      const columns = await adapter.columns("set_tests");
      const column = columns.find((c) => c.name === "set_column");
      expect((column as any).isUnsigned()).toBeFalsy();
    });

    it("should not be bigint", async () => {
      const columns = await adapter.columns("set_tests");
      const column = columns.find((c) => c.name === "set_column");
      expect((column as any).isBigint()).toBeFalsy();
    });

    it("schema dumping", async () => {
      const schema = await dumpTableSchema("set_tests");
      expect(schema).toMatch(
        /t\.column\("set_column", "set\('text','blob','tiny','medium','long','unsigned','bigint'\)"\)/,
      );
    });
  });
});
