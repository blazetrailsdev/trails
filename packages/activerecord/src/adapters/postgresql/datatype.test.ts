/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/datatype_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS ex CASCADE`);
    await adapter.close();
  });

  describe("PostgreSQLDatatypeTest", () => {
    it.skip("money column", async () => {});
    it.skip("number column", async () => {});
    it.skip("time column", async () => {});
    it.skip("date column", async () => {});
    it.skip("timestamp column", async () => {});
    it.skip("boolean column", async () => {});
    it.skip("text column", async () => {});
    it.skip("binary column", async () => {});
    it.skip("oid column", async () => {});
    it.skip("data type of time types", async () => {
      // Requires AR model with interval column; no adapter-level equivalent
    });
    it.skip("data type of oid types", async () => {
      // Requires AR model with oid column; no adapter-level equivalent
    });
    it.skip("time values", async () => {
      // Requires AR model (PostgresqlTime); no adapter-level equivalent
    });
    it.skip("update large time in seconds", async () => {});
    it.skip("oid values", async () => {
      // Requires AR model (PostgresqlOid); no adapter-level equivalent
    });
    it.skip("update oid", async () => {});

    it("text columns are limitless the upper limit is one GB", async () => {
      expect(adapter.typeToSql("text", { limit: 100_000 })).toBe("text");
      expect(() => adapter.typeToSql("text", { limit: 4_294_967_295 })).toThrow();
    });
  });

  describe("PostgreSQLInternalDatatypeTest", () => {
    it("name column type", async () => {
      await adapter.exec(`CREATE TABLE ex (data name)`);
      const cols = await adapter.columns("ex");
      const col = cols.find((c) => c.name === "data");
      expect(col).toBeDefined();
      expect(col!.baseType).toBe("string");
    });

    it("char column type", async () => {
      await adapter.exec(`CREATE TABLE ex (data "char")`);
      const cols = await adapter.columns("ex");
      const col = cols.find((c) => c.name === "data");
      expect(col).toBeDefined();
      expect(col!.baseType).toBe("string");
    });
  });
});
