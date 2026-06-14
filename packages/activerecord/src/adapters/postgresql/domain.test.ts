/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/domain_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BigDecimal } from "@blazetrails/activesupport";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
import { Base } from "../../index.js";
import { Column as PgColumn } from "../../connection-adapters/postgresql/column.js";

// Rails: class PostgresqlDomain < ActiveRecord::Base
//   self.table_name = "postgresql_domains"
class PostgresqlDomain extends Base {
  static {
    this.tableName = "postgresql_domains";
  }
}

describeIfPg("PostgreSQLAdapter", () => {
  setupHandlerSuite();

  let connection: PostgreSQLAdapter;

  beforeEach(async () => {
    // Rails: @connection = ActiveRecord::Base.lease_connection
    connection = Base.connection as PostgreSQLAdapter;
    // Rails: @connection.transaction { execute "CREATE DOMAIN custom_money as numeric(8,2)" }
    await connection.execute("DROP DOMAIN IF EXISTS custom_money CASCADE");
    await connection.execute("CREATE DOMAIN custom_money AS numeric(8,2)");
    // Rails: @connection.create_table("postgresql_domains") { |t| t.column :price, :custom_money }
    await connection.execute(
      `CREATE TABLE postgresql_domains (id SERIAL PRIMARY KEY, price custom_money)`,
    );
    // Rails' create_table auto-calls reload_type_map; raw execute() does not.
    // Without a full reload, registerDomainType can't find the base numeric OID.
    await connection.reloadTypeMap();
    PostgresqlDomain.resetColumnInformation();
    await PostgresqlDomain.loadSchema();
  });

  afterEach(async () => {
    // Rails: teardown drop_table + DROP DOMAIN
    await connection.execute("DROP TABLE IF EXISTS postgresql_domains");
    await connection.execute("DROP DOMAIN IF EXISTS custom_money");
    PostgresqlDomain.resetColumnInformation();
    // Rails: reset_connection flushes the type map; mirror composite.test.ts:63-64
    await connection.reloadTypeMap();
  });

  describe("PostgresqlDomainTest", () => {
    it("column", async () => {
      // Rails: column = PostgresqlDomain.columns_hash["price"]
      const column = PostgresqlDomain.columnsHash()["price"] as unknown as PgColumn;
      // Rails: assert_equal :decimal, column.type
      expect(column.type).toBe("decimal");
      // Rails: assert_equal "custom_money", column.sql_type
      expect(column.sqlType).toBe("custom_money");
      // Rails: assert_not_predicate column, :array?
      expect(column.isArray()).toBe(false);
      // Rails: type = PostgresqlDomain.type_for_attribute("price")
      const type = PostgresqlDomain.typeForAttribute("price");
      // Rails: assert_not_predicate type, :binary?
      expect(type.isBinary()).toBe(false);
    });

    it("domain acts like basetype", async () => {
      // Rails: PostgresqlDomain.create price: ""
      await PostgresqlDomain.create({ price: "" });
      // Rails: record = PostgresqlDomain.first; assert_nil record.price
      const record = (await PostgresqlDomain.first()) as any;
      expect(record.price).toBeNull();

      // Rails: record.price = "34.15"; record.save!
      record.price = "34.15";
      await record.saveBang();

      // Rails: assert_equal BigDecimal("34.15"), record.reload.price
      await record.reload();
      expect((record.price as BigDecimal).toString("F")).toBe("34.15");
    });
  });
});
