import { it, expect, beforeEach, afterEach } from "vitest";
import { assertPredicate } from "@blazetrails/activesupport";
import { describeIfMysqlAdapter, leaseMysqlAdapter, Mysql2Adapter } from "./test-helper.js";
import { describeIfSupports } from "../../support/supports.js";
import { SchemaDumper } from "../../schema-dumper.js";

describeIfMysqlAdapter("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;

  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
    await adapter.dropTable("virtual_columns", { ifExists: true }).catch(() => {});
    await adapter.createTable("virtual_columns", { force: "cascade" }, (t: any) => {
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
    await adapter.exec("INSERT INTO virtual_columns (name) VALUES ('Rails')");
  });

  afterEach(async () => {
    await adapter.dropTable("virtual_columns", { ifExists: true }).catch(() => {});
  });

  describeIfSupports("virtual_columns", "VirtualColumnTest", () => {
    const findColumn = async (name: string) => {
      const cols = (await adapter.columns("virtual_columns")) as unknown as Array<{
        name: string;
        extra: string;
        isVirtual(): boolean;
      }>;
      return cols.find((c) => c.name === name);
    };

    it("virtual column", async () => {
      const column = await findColumn("upper_name");
      assertPredicate(column!, (c) => c.isVirtual());
      expect(column!.extra).toMatch(/\bVIRTUAL\b/);
      const value = await adapter.selectValue("SELECT upper_name FROM virtual_columns LIMIT 1");
      expect(value).toBe("RAILS");
    });

    it("stored column", async () => {
      const column = await findColumn("name_length");
      assertPredicate(column!, (c) => c.isVirtual());
      expect(column!.extra).toMatch(/\b(?:STORED|PERSISTENT)\b/);
      const value = await adapter.selectValue("SELECT name_length FROM virtual_columns LIMIT 1");
      expect(value).toBe(5);
    });

    it("schema dumping", async () => {
      const output = await SchemaDumper.dumpTableSchema(adapter as any, "virtual_columns");
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
