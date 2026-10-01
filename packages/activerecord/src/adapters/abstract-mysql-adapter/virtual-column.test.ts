import { it, expect, beforeEach, afterEach } from "vitest";
import { assertPredicate } from "@blazetrails/activesupport";
import { describeIfMysqlAdapter, leaseMysqlAdapter, Mysql2Adapter } from "./test-helper.js";
import { describeIfSupports } from "../../support/supports.js";
import { Base } from "../../base.js";
import type { Column as MySQLColumn } from "../../connection-adapters/mysql/column.js";
import { dumpTableSchema } from "../../support/schema-dumping-helper.js";

class VirtualColumn extends Base {}

describeIfMysqlAdapter("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;

  async function take(): Promise<Record<string, unknown>> {
    return (await VirtualColumn.take()) as unknown as Record<string, unknown>;
  }

  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
    await adapter.createTable("virtual_columns", { force: true }, (t) => {
      t.string("name");
      t.virtual("upper_name", { type: "string", as: "UPPER(`name`)" });
      t.virtual("name_length", { type: "integer", as: "LENGTH(`name`)", stored: true });
      t.virtual("name_octet_length", { type: "integer", as: "OCTET_LENGTH(`name`)", stored: true });
      t.json("profile");
      t.virtual("profile_email", {
        type: "string",
        as: "json_extract(`profile`,_utf8mb4'$.email')",
        stored: true,
      });
      t.datetime("time");
      t.virtual("time_mirror", { type: "datetime", as: "`time`" });
    });
    await VirtualColumn.create({ name: "Rails" });
  });

  afterEach(async () => {
    await adapter.dropTable("virtual_columns", { ifExists: true });
    void VirtualColumn.resetColumnInformation();
  });

  describeIfSupports("virtual_columns", "VirtualColumnTest", () => {
    it("virtual column", async () => {
      const column = VirtualColumn.columnsHash()["upper_name"] as unknown as MySQLColumn;
      assertPredicate(column, (c) => c.isVirtual());
      expect(column.extra).toMatch(/\bVIRTUAL\b/);
      expect((await take()).upper_name).toBe("RAILS");
    });

    it("stored column", async () => {
      const column = VirtualColumn.columnsHash()["name_length"] as unknown as MySQLColumn;
      assertPredicate(column, (c) => c.isVirtual());
      expect(column.extra).toMatch(/\b(?:STORED|PERSISTENT)\b/);
      expect((await take()).name_length).toBe(5);
    });

    it("change table", async () => {
      await adapter.changeTable("virtual_columns", async (t) => {
        await t.virtual("lower_name", { type: "string", as: "LOWER(name)" });
      });
      void VirtualColumn.resetColumnInformation();
      await VirtualColumn.loadSchema();
      const column = VirtualColumn.columnsHash()["lower_name"] as unknown as MySQLColumn;
      assertPredicate(column, (c) => c.isVirtual());
      expect(column.extra).toMatch(/\bVIRTUAL\b/);
      expect((await take()).lower_name).toBe("rails");
    });

    it("schema dumping", async () => {
      const output = await dumpTableSchema(adapter, "virtual_columns");
      expect(output).toMatch(
        /t\.virtual\("upper_name", \{ type: "string", as: "(?:upper|ucase)\(`?name`?\)" \}\);/i,
      );
      expect(output).toMatch(
        /t\.virtual\("name_length", \{ type: "integer", as: "(?:octet_)?length\(`?name`?\)", stored: true \}\);/i,
      );
      expect(output).toMatch(
        /t\.virtual\("name_octet_length", \{ type: "integer", as: "(?:octet_)?length\(`?name`?\)", stored: true \}\);/i,
      );
      expect(output).toMatch(
        /t\.virtual\("profile_email", \{ type: "string", as: "json_extract\(`profile`,\w*?'\$\.email'\)", stored: true \}\);/i,
      );
      expect(output).toMatch(
        /t\.virtual\("time_mirror", \{ type: "datetime",.*as: "`time`" \}\);/i,
      );
    });
  });
});
