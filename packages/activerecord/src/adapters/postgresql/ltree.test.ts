import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { Base } from "../../index.js";
import { fixtures } from "../../test-fixtures.js";
import type { Column as PgColumn } from "../../connection-adapters/postgresql/column.js";
import { dumpTableSchema } from "../../support/schema-dumping-helper.js";

class Ltree extends Base {
  static {
    this.tableName = "ltrees";
    this.attribute("id", "integer");
  }
  declare path: string;
}

describeIfPg("PostgreSQLAdapter", () => {
  fixtures({}, { useTransactionalTests: false });

  let connection: PostgreSQLAdapter;

  beforeEach(async () => {
    connection = Base.connection as PostgreSQLAdapter;

    await connection.enableExtension("ltree");

    await connection.createTable("ltrees", (t) => {
      t.ltree("path");
    });

    void Ltree.resetColumnInformation();
    await Ltree.loadSchema();
  });

  afterEach(async () => {
    await connection.dropTable("ltrees", { ifExists: true });
    void Ltree.resetColumnInformation();
  });

  describe("PostgresqlLtreeTest", () => {
    it("column", async () => {
      const column = Ltree.columnsHash()["path"] as unknown as PgColumn;
      expect(column.type).toBe("ltree");
      expect(column.sqlType).toBe("ltree");
      expect(column.array).toBeFalsy();

      const type = Ltree.typeForAttribute("path")!;
      expect(type.isBinary()).toBeFalsy();
    });

    it("write", async () => {
      const ltree = Ltree.new({ path: "1.2.3.4" });
      expect(await ltree.saveBang()).toBeTruthy();
    });

    it("select", async () => {
      await connection.execute("insert into ltrees (path) VALUES ('1.2.3')");
      const ltree = await Ltree.first();
      expect(ltree!.path).toBe("1.2.3");
    });

    it("schema dump with shorthand", async () => {
      const output = await dumpTableSchema(connection, "ltrees");
      expect(output).toMatch(/t\.ltree\("path"\)/);
    });
  });
});
