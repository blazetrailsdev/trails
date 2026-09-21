import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base, StatementInvalid } from "../../index.js";
import { assert, assertNotPredicate } from "@blazetrails/activesupport";
import { dumpTableSchema } from "../../support/schema-dumping-helper.js";
import type { Column as PgColumn } from "../../connection-adapters/postgresql/column.js";

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
      connection = Base.connection as PostgreSQLAdapter;
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

    it("bit string column", () => {
      const column = PostgresqlBitString.columnsHash()["a_bit"] as unknown as PgColumn;
      expect(column.type).toBe("bit");
      expect(column.sqlType).toBe("bit(8)");
      assertNotPredicate(column, (c: PgColumn) => c.isArray());

      const type = PostgresqlBitString.typeForAttribute("a_bit")!;
      assertNotPredicate(type, (t) => t.isBinary());
    });

    it("bit string varying column", () => {
      const column = PostgresqlBitString.columnsHash()["a_bit_varying"] as unknown as PgColumn;
      expect(column.type).toBe("bit_varying");
      expect(column.sqlType).toBe("bit varying(4)");
      assertNotPredicate(column, (c: PgColumn) => c.isArray());

      const type = PostgresqlBitString.typeForAttribute("a_bit_varying")!;
      assertNotPredicate(type, (t) => t.isBinary());
    });

    it("default", () => {
      expect(PostgresqlBitString.columnDefaults["a_bit"]).toBe("00000011");
      expect(new PostgresqlBitString().a_bit).toBe("00000011");

      expect(PostgresqlBitString.columnDefaults["a_bit_varying"]).toBe("0011");
      expect(new PostgresqlBitString().a_bit_varying).toBe("0011");
    });

    it("schema dumping", async () => {
      const output = await dumpTableSchema(connection, "postgresql_bit_strings");
      expect(output).toMatch(/t\.bit\("a_bit",\s*\{\s*limit: 8,\s*default: "00000011"\s*\}\);?$/m);
      expect(output).toMatch(
        /t\.bitVarying\("a_bit_varying",\s*\{\s*limit: 4,\s*default: "0011"\s*\}\);?$/m,
      );
    });

    it("assigning invalid hex string raises exception", async (ctx) => {
      ctx.skip(!connection.preparedStatements);
      await expect(PostgresqlBitString.createBang({ a_bit: "FF" })).rejects.toThrow(
        StatementInvalid,
      );
      await expect(PostgresqlBitString.createBang({ a_bit_varying: "F" })).rejects.toThrow(
        StatementInvalid,
      );
    });

    it("roundtrip", async () => {
      const record = await PostgresqlBitString.createBang({
        a_bit: "00001010",
        a_bit_varying: "0101",
      });
      expect(record.a_bit).toBe("00001010");
      expect(record.a_bit_varying).toBe("0101");
      expect(record.another_bit).toBeNull();
      expect(record.another_bit_varying).toBeNull();

      record.a_bit = "11111111";
      record.a_bit_varying = "0xF";
      await record.saveBang();

      assert(await record.reload());
      expect(record.a_bit).toBe("11111111");
      expect(record.a_bit_varying).toBe("1111");
    });

    it("bit string type cast", async () => {
      const { Bit } = await import("../../connection-adapters/postgresql/oid/bit.js");
      const type = new Bit();
      expect(type.cast("0101")).toBe("0101");
      expect(type.cast("0xFF")).toBe("11111111");
      expect(type.cast(null)).toBeNull();
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

    it("varbit string default", async () => {
      const cols = await connection.columns("postgresql_bit_strings");
      const col = cols.find((c) => c.name === "a_bit_varying")!;
      expect(col).toBeDefined();
      expect(col.type).toBe("bit_varying");
      expect(col.default).toBe("0011");
    });
  });
});
