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
    it.skip("money column", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in datatype
      // ROOT-CAUSE: adapters/postgresql/datatype.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/datatype.ts; affects ~10–47 tests in datatype.test.ts
    });
    it.skip("number column", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in datatype
      // ROOT-CAUSE: adapters/postgresql/datatype.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/datatype.ts; affects ~10–47 tests in datatype.test.ts
    });
    it.skip("time column", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in datatype
      // ROOT-CAUSE: adapters/postgresql/datatype.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/datatype.ts; affects ~10–47 tests in datatype.test.ts
    });
    it.skip("date column", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in datatype
      // ROOT-CAUSE: adapters/postgresql/datatype.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/datatype.ts; affects ~10–47 tests in datatype.test.ts
    });
    it.skip("timestamp column", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in datatype
      // ROOT-CAUSE: adapters/postgresql/datatype.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/datatype.ts; affects ~10–47 tests in datatype.test.ts
    });
    it.skip("boolean column", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in datatype
      // ROOT-CAUSE: adapters/postgresql/datatype.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/datatype.ts; affects ~10–47 tests in datatype.test.ts
    });
    it.skip("text column", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in datatype
      // ROOT-CAUSE: adapters/postgresql/datatype.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/datatype.ts; affects ~10–47 tests in datatype.test.ts
    });
    it.skip("binary column", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in datatype
      // ROOT-CAUSE: adapters/postgresql/datatype.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/datatype.ts; affects ~10–47 tests in datatype.test.ts
    });
    it.skip("oid column", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in datatype
      // ROOT-CAUSE: adapters/postgresql/datatype.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/datatype.ts; affects ~10–47 tests in datatype.test.ts
    });
    it.skip("data type of time types", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in datatype
      // ROOT-CAUSE: adapters/postgresql/datatype.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/datatype.ts; affects ~10–47 tests in datatype.test.ts
      // Requires AR model with interval column; no adapter-level equivalent
    });
    it.skip("data type of oid types", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in datatype
      // ROOT-CAUSE: adapters/postgresql/datatype.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/datatype.ts; affects ~10–47 tests in datatype.test.ts
      // Requires AR model with oid column; no adapter-level equivalent
    });
    it.skip("time values", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in datatype
      // ROOT-CAUSE: adapters/postgresql/datatype.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/datatype.ts; affects ~10–47 tests in datatype.test.ts
      // Requires AR model (PostgresqlTime); no adapter-level equivalent
    });
    it.skip("update large time in seconds", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in datatype
      // ROOT-CAUSE: adapters/postgresql/datatype.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/datatype.ts; affects ~10–47 tests in datatype.test.ts
    });
    it.skip("oid values", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in datatype
      // ROOT-CAUSE: adapters/postgresql/datatype.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/datatype.ts; affects ~10–47 tests in datatype.test.ts
      // Requires AR model (PostgresqlOid); no adapter-level equivalent
    });
    it.skip("update oid", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in datatype
      // ROOT-CAUSE: adapters/postgresql/datatype.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/datatype.ts; affects ~10–47 tests in datatype.test.ts
    });

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
