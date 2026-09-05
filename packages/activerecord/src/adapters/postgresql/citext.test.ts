import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { Base, Rollback } from "../../index.js";
import { fixtures } from "../../test-fixtures.js";
import type { Column as PgColumn } from "../../connection-adapters/postgresql/column.js";

class Citext extends Base {
  static {
    this.tableName = "citexts";
    this.attribute("id", "integer");
  }
  declare cival: string;
}

describeIfPg("PostgreSQLAdapter", () => {
  fixtures({}, { useTransactionalTests: false });

  let connection: PostgreSQLAdapter;

  beforeEach(async () => {
    connection = Base.connection as PostgreSQLAdapter;
    await connection.enableExtension("citext");
    await connection.createTable("citexts", (t) => {
      t.citext("cival");
    });
    void Citext.resetColumnInformation();
    await Citext.loadSchema();
  });

  afterEach(async () => {
    await connection.dropTable("citexts", { ifExists: true });
    await connection.disableExtension("citext");
    void Citext.resetColumnInformation();
  });

  describe("PostgresqlCitextTest", () => {
    it("citext enabled", async () => {
      expect(await connection.extensionEnabled("citext")).toBe(true);
    });

    it("column", async () => {
      const column = Citext.columnsHash()["cival"] as unknown as PgColumn;
      expect(column).toBeDefined();
      expect(column.type).toBe("citext");
      expect(column.sqlType).toBe("citext");
      expect(column.array).toBeFalsy();

      const type = Citext.typeForAttribute("cival")!;
      expect(type.isBinary()).toBe(false);
    });

    it("change table supports json", async () => {
      try {
        await connection.transaction(async () => {
          await connection.changeTable("citexts", async (t) => {
            await t.citext("username");
          });
          await Citext.resetColumnInformation();
          const column = Citext.columnsHash()["username"] as unknown as PgColumn;
          expect(column.type).toBe("citext");

          throw new Rollback();
        });
      } finally {
        void Citext.resetColumnInformation();
      }
    });

    it("write", async () => {
      const x = Citext.new({ cival: "Some CI Text" });
      await x.saveBang();
      const citext = await Citext.first();
      expect(citext!.cival).toBe("Some CI Text");

      citext!.cival = "Some NEW CI Text";
      await citext!.saveBang();
      await citext!.reload();
      expect(citext!.cival).toBe("Some NEW CI Text");
    });

    it("select case insensitive", async () => {
      await connection.execute("insert into citexts (cival) values('Cased Text')");
      const x = await Citext.where({ cival: "cased text" }).first();
      expect(x!.cival).toBe("Cased Text");
    });

    it("case insensitiveness", async () => {
      const attr = Citext.arelTable.get("cival");
      const comparison = await connection.caseInsensitiveComparison(attr, null);
      const sql = connection.visitor.compile(comparison);
      expect(sql).not.toMatch(/lower/i);
    });

    it("schema dump with shorthand", async () => {
      const output = await SchemaDumper.dumpTableSchema(connection, "citexts");
      expect(output).toMatch(/t\.citext\("cival"\)/);
    });
  });
});
