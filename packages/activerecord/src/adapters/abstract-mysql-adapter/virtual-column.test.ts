/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/virtual_column_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;

  // The table is built per test (in beforeEach, after the global drop-all reset)
  // because the adapter dir runs under the AR setup, which wipes all tables before
  // every test. Mirrors Rails' `setup`/`teardown` create_table/drop_table dance.
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
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
    await adapter.close();
  });

  describe("VirtualColumnTest", () => {
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
      expect(column!.isVirtual()).toBe(true);
      expect(column!.extra).toMatch(/\bVIRTUAL\b/);
      const value = await adapter.selectValue("SELECT upper_name FROM virtual_columns LIMIT 1");
      expect(value).toBe("RAILS");
    });

    it("stored column", async () => {
      const column = await findColumn("name_length");
      expect(column!.isVirtual()).toBe(true);
      expect(column!.extra).toMatch(/\b(?:STORED|PERSISTENT)\b/);
      const value = await adapter.selectValue("SELECT name_length FROM virtual_columns LIMIT 1");
      expect(value).toBe(5);
    });

    it("schema dumping", async () => {
      const output = await SchemaDumper.dumpTableSchema(adapter as any, "virtual_columns");
      // A non-stored generated column dumps without `stored: true`; a STORED one with it.
      // Function casing/backtick follow MySQL's normalized GENERATION_EXPRESSION (UPPER→upper,
      // OCTET_LENGTH→length); the JSON-path single quotes round-trip after the `\'`→`'` unescape.
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
      // `time_mirror` may carry `precision: null` before `as` (datetime); match the
      // line ending in the self-referential expression, mirroring Rails' `$`-anchor.
      expect(output).toMatch(
        /t\.virtual\("time_mirror", \{ type: "datetime",.*as: "`time`" \}\);/i,
      );
    });
  });
});
