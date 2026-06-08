/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/numbers_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
import { Base } from "../../index.js";

// Rails: class PostgresqlNumber < ActiveRecord::Base
class PostgresqlNumber extends Base {
  static {
    this.tableName = "postgresql_numbers";
  }
}

describeIfPg("PostgreSQLAdapter", () => {
  setupHandlerSuite();

  let connection: PostgreSQLAdapter;

  beforeEach(async () => {
    connection = Base.connection as PostgreSQLAdapter;
    await connection.execute("DROP TABLE IF EXISTS postgresql_numbers");
    await connection.execute(
      `CREATE TABLE postgresql_numbers (id SERIAL PRIMARY KEY, single REAL, double DOUBLE PRECISION)`,
    );
    PostgresqlNumber.resetColumnInformation();
    await PostgresqlNumber.loadSchema();
  });

  afterEach(async () => {
    await connection.execute("DROP TABLE IF EXISTS postgresql_numbers");
    PostgresqlNumber.resetColumnInformation();
  });

  describe("PostgreSQLNumberTest", () => {
    it("data type", async () => {
      // Rails: assert_equal :float, PostgresqlNumber.columns_hash["single"].type
      expect(PostgresqlNumber.columnsHash()["single"].type).toBe("float");
      // Rails: assert_equal :float, PostgresqlNumber.columns_hash["double"].type
      expect(PostgresqlNumber.columnsHash()["double"].type).toBe("float");
    });

    it("values", async () => {
      // Rails: @connection.execute "INSERT INTO postgresql_numbers ..."
      await connection.execute(
        `INSERT INTO postgresql_numbers (id, single, double) VALUES (1, 123.456, 123456.789)`,
      );
      await connection.execute(
        `INSERT INTO postgresql_numbers (id, single, double) VALUES (2, '-Infinity', 'Infinity')`,
      );
      await connection.execute(
        `INSERT INTO postgresql_numbers (id, single, double) VALUES (3, 123.456, 'NaN')`,
      );

      // Rails: first, second, third = PostgresqlNumber.find(1, 2, 3)
      const [first, second, third] = (await PostgresqlNumber.find([1, 2, 3])) as any[];

      // Rails: assert_equal 123.456, first.single
      expect(first.single).toBe(123.456);
      // Rails: assert_equal 123456.789, first.double
      expect(first.double).toBe(123456.789);
      // Rails: assert_equal(-::Float::INFINITY, second.single)
      expect(second.single).toBe(-Infinity);
      // Rails: assert_equal ::Float::INFINITY, second.double
      expect(second.double).toBe(Infinity);
      // Rails: assert_predicate third.double, :nan?
      expect(Number.isNaN(third.double)).toBe(true);
    });

    it("update", async () => {
      // Rails: record = PostgresqlNumber.create! single: "123.456", double: "123456.789"
      const record = (await PostgresqlNumber.createBang({
        single: "123.456",
        double: "123456.789",
      })) as any;
      // Rails: record.single = new_single; record.double = new_double; record.save!
      record.single = 789.012;
      record.double = 789012.345;
      await record.saveBang();
      // Rails: record.reload; assert_equal new_single, record.single
      await record.reload();
      expect(record.single).toBe(789.012);
      expect(record.double).toBe(789012.345);
    });

    it("reassigning infinity does not mark record as changed", async () => {
      // Rails: record = PostgresqlNumber.create!(single: Float::INFINITY, double: -Float::INFINITY)
      const record = (await PostgresqlNumber.createBang({
        single: Infinity,
        double: -Infinity,
      })) as any;
      await record.reload();
      // Rails: record.single = Float::INFINITY; record.double = -Float::INFINITY
      record.single = Infinity;
      record.double = -Infinity;
      // Rails: assert_not_predicate record, :changed?
      expect(record.changed).toBe(false);
    });

    it("reassigning nan does not mark record as changed", async () => {
      // Rails: record = PostgresqlNumber.create!(single: Float::NAN, double: Float::NAN)
      const record = (await PostgresqlNumber.createBang({
        single: NaN,
        double: NaN,
      })) as any;
      await record.reload();
      // Rails: record.single = Float::NAN; record.double = Float::NAN
      record.single = NaN;
      record.double = NaN;
      // Rails: assert_not_predicate record, :changed?
      expect(record.changed).toBe(false);
    });
  });
});
