import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base } from "../../index.js";
import { Bit } from "../../connection-adapters/postgresql/oid/bit.js";

describeIfPg("PostgreSQLAdapter", () => {
  fixtures({}, { useTransactionalTests: false });

  describe("PostgresqlBitStringTest", () => {
    class PostgresqlBitString extends Base {
      declare a_bit: string | null;
      declare a_bit_varying: string | null;
      declare another_bit: string | null;
      declare another_bit_varying: string | null;

      static {
        this.tableName = "postgresql_bit_strings";
      }
    }

    let connection: PostgreSQLAdapter;
    beforeEach(async () => {
      connection = (await Base.leaseConnection()) as PostgreSQLAdapter;
      await connection.createTable("postgresql_bit_strings", { force: true }, (t) => {
        t.bit("a_bit", { default: "00000011", limit: 8 });
        t.bitVarying("a_bit_varying", { default: "0011", limit: 4 });
        t.bit("another_bit");
        t.bitVarying("another_bit_varying");
      });
      void PostgresqlBitString.resetColumnInformation();
      await PostgresqlBitString.loadSchema();
    });

    afterEach(async () => {
      if (!connection) return;
      await connection.dropTable("postgresql_bit_strings", { ifExists: true });
      void PostgresqlBitString.resetColumnInformation();
    });

    it("bit string type cast", () => {
      const type = new Bit();
      expect(type.castValue("0101")).toBe("0101");
      expect(type.castValue("0xFF")).toBe("11111111");
      expect(type.castValue(null)).toBeNull();
    });

    it("bit string invalid", async () => {
      await expect(
        connection.execute(`INSERT INTO postgresql_bit_strings (a_bit) VALUES (B'0000000011')`),
      ).rejects.toThrow();
    });

    it("varbit string", async () => {
      await connection.execute(
        `INSERT INTO postgresql_bit_strings (a_bit, a_bit_varying) VALUES (B'11111111', B'1111')`,
      );
      const rows = await connection.execute(
        `SELECT a_bit, a_bit_varying FROM postgresql_bit_strings`,
      );
      expect(rows[0].a_bit).toBe("11111111");
      expect(rows[0].a_bit_varying).toBe("1111");
    });
  });
});
