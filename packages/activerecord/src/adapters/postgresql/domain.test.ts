import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertNotPredicate, BigDecimal } from "@blazetrails/activesupport";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base } from "../../index.js";
import { Column as PgColumn } from "../../connection-adapters/postgresql/column.js";

class PostgresqlDomain extends Base {
  static {
    this.tableName = "postgresql_domains";
    this.attribute("id", "integer");
  }
}

describeIfPg("PostgreSQLAdapter", () => {
  fixtures({}, { useTransactionalTests: false });

  let connection: PostgreSQLAdapter;

  beforeEach(async () => {
    connection = Base.connection as PostgreSQLAdapter;
    await connection.execute("DROP DOMAIN IF EXISTS custom_money CASCADE");
    await connection.execute("CREATE DOMAIN custom_money AS numeric(8,2)");
    await connection.execute(
      `CREATE TABLE postgresql_domains (id SERIAL PRIMARY KEY, price custom_money)`,
    );
    await connection.reloadTypeMap();
    void PostgresqlDomain.resetColumnInformation();
    await PostgresqlDomain.loadSchema();
  });

  afterEach(async () => {
    await connection.execute("DROP TABLE IF EXISTS postgresql_domains");
    await connection.execute("DROP DOMAIN IF EXISTS custom_money");
    void PostgresqlDomain.resetColumnInformation();
    await connection.reloadTypeMap();
  });

  describe("PostgresqlDomainTest", () => {
    it("column", async () => {
      const column = PostgresqlDomain.columnsHash()["price"] as unknown as PgColumn;
      expect(column.type).toBe("decimal");
      expect(column.sqlType).toBe("custom_money");
      assertNotPredicate(column, (c) => c.isArray());
      const type = PostgresqlDomain.typeForAttribute("price")!;
      assertNotPredicate(type, (t) => t.isBinary());
    });

    it("domain acts like basetype", async () => {
      await PostgresqlDomain.create({ price: "" });
      const record = (await PostgresqlDomain.first()) as any;
      expect(record.price).toBeNull();

      record.price = "34.15";
      await record.saveBang();

      await record.reload();
      expect((record.price as BigDecimal).toString("F")).toBe("34.15");
    });
  });
});
