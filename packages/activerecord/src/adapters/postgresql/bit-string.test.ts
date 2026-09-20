import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { dumpTableSchema } from "../../support/schema-dumping-helper.js";
import type { Column as PgColumn } from "../../connection-adapters/postgresql/column.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.execute(`DROP TABLE IF EXISTS postgresql_bit_strings`);
    await adapter.execute(`
      CREATE TABLE postgresql_bit_strings (
        id serial primary key,
        a_bit bit(8) DEFAULT B'00000011',
        a_bit_varying bit varying(4) DEFAULT B'0011',
        another_bit bit,
        another_bit_varying bit varying
      )
    `);
  });
  afterEach(async () => {
    await adapter.execute(`DROP TABLE IF EXISTS postgresql_bit_strings`);
    await adapter.disconnectBang();
  });

  describe("PostgresqlBitStringTest", () => {
    it("bit string", async () => {
      const output = await dumpTableSchema(adapter, "postgresql_bit_strings");
      expect(output).toMatch(/t\.bit\("a_bit",\s*\{[^}]*limit:\s*8[^}]*default:\s*"00000011"/);
      expect(output).toMatch(
        /t\.bitVarying\("a_bit_varying",\s*\{[^}]*limit:\s*4[^}]*default:\s*"0011"/,
      );
    });

    it("bit string default", async () => {
      const cols = await adapter.columns("postgresql_bit_strings");
      const aBit = cols.find((c) => c.name === "a_bit")!;
      expect(aBit.default).toBe("00000011");
      const aBitVarying = cols.find((c) => c.name === "a_bit_varying")!;
      expect(aBitVarying.default).toBe("0011");
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
        adapter.execute(`INSERT INTO postgresql_bit_strings (a_bit) VALUES (B'0000000011')`),
      ).rejects.toThrow();
    });

    it("varbit string", async () => {
      await adapter.execute(
        `INSERT INTO postgresql_bit_strings (a_bit, a_bit_varying) VALUES (B'11111111', B'1111')`,
      );
      const rows = await adapter.execute(`SELECT a_bit, a_bit_varying FROM postgresql_bit_strings`);
      expect(rows[0].a_bit).toBe("11111111");
      expect(rows[0].a_bit_varying).toBe("1111");
    });

    it("varbit string default", async () => {
      const cols = await adapter.columns("postgresql_bit_strings");
      const col = cols.find((c) => c.name === "a_bit_varying")!;
      expect(col).toBeDefined();
      expect(col.type).toBe("bit_varying");
      expect(col.default).toBe("0011");
    });

    it("bit string column", async () => {
      const cols = await adapter.columns("postgresql_bit_strings");
      const column = cols.find((c) => c.name === "a_bit") as unknown as PgColumn;
      expect(column.type).toBe("bit");
      expect(column.sqlType).toBe("bit(8)");
      expect(column.isArray()).toBeFalsy();

      const type = await adapter.lookupCastTypeFromColumn(column);
      expect(type.isBinary()).toBeFalsy();
    });

    it("bit string varying column", async () => {
      const cols = await adapter.columns("postgresql_bit_strings");
      const column = cols.find((c) => c.name === "a_bit_varying") as unknown as PgColumn;
      expect(column.type).toBe("bit_varying");
      expect(column.sqlType).toBe("bit varying(4)");
      expect(column.isArray()).toBeFalsy();

      const type = await adapter.lookupCastTypeFromColumn(column);
      expect(type.isBinary()).toBeFalsy();
    });

    it("assigning invalid hex string raises exception", async () => {
      await expect(
        adapter.execute(`INSERT INTO postgresql_bit_strings (a_bit) VALUES ('FF')`),
      ).rejects.toThrow();
      await expect(
        adapter.execute(`INSERT INTO postgresql_bit_strings (a_bit_varying) VALUES ('F')`),
      ).rejects.toThrow();
    });
  });
});
