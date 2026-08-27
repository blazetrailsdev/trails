import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base } from "../../index.js";

class PostgresqlNumber extends Base {
  static {
    this.tableName = "postgresql_numbers";
    this.attribute("id", "integer");
  }
}

describeIfPg("PostgreSQLAdapter", () => {
  fixtures({}, { useTransactionalTests: false });

  let connection: PostgreSQLAdapter;

  beforeEach(async () => {
    connection = Base.connection as PostgreSQLAdapter;
    await connection.execute("DROP TABLE IF EXISTS postgresql_numbers");
    await connection.execute(
      `CREATE TABLE postgresql_numbers (id SERIAL PRIMARY KEY, single REAL, double DOUBLE PRECISION)`,
    );
    void PostgresqlNumber.resetColumnInformation();
    await PostgresqlNumber.loadSchema();
  });

  afterEach(async () => {
    await connection.execute("DROP TABLE IF EXISTS postgresql_numbers");
    void PostgresqlNumber.resetColumnInformation();
  });

  describe("PostgreSQLNumberTest", () => {
    it("data type", async () => {
      expect(PostgresqlNumber.columnsHash()["single"].type).toBe("float");
      expect(PostgresqlNumber.columnsHash()["double"].type).toBe("float");
    });

    it("values", async () => {
      await connection.execute(
        `INSERT INTO postgresql_numbers (id, single, double) VALUES (1, 123.456, 123456.789)`,
      );
      await connection.execute(
        `INSERT INTO postgresql_numbers (id, single, double) VALUES (2, '-Infinity', 'Infinity')`,
      );
      await connection.execute(
        `INSERT INTO postgresql_numbers (id, single, double) VALUES (3, 123.456, 'NaN')`,
      );

      const [first, second, third] = (await PostgresqlNumber.find([1, 2, 3])) as any[];

      expect(first.single).toBe(123.456);
      expect(first.double).toBe(123456.789);
      expect(second.single).toBe(-Infinity);
      expect(second.double).toBe(Infinity);
      expect(Number.isNaN(third.double)).toBe(true);
    });

    it("update", async () => {
      const record = (await PostgresqlNumber.createBang({
        single: "123.456",
        double: "123456.789",
      })) as any;
      record.single = 789.012;
      record.double = 789012.345;
      await record.saveBang();
      await record.reload();
      expect(record.single).toBe(789.012);
      expect(record.double).toBe(789012.345);
    });

    it("reassigning infinity does not mark record as changed", async () => {
      const record = (await PostgresqlNumber.createBang({
        single: Infinity,
        double: -Infinity,
      })) as any;
      await record.reload();
      record.single = Infinity;
      record.double = -Infinity;
      expect(record.isChanged).toBe(false);
    });

    it("reassigning nan does not mark record as changed", async () => {
      const record = (await PostgresqlNumber.createBang({
        single: NaN,
        double: NaN,
      })) as any;
      await record.reload();
      record.single = NaN;
      record.double = NaN;
      expect(record.isChanged).toBe(false);
    });
  });
});
