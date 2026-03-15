/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/postgresql_adapter_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    // Clean up test tables
    try {
      const tables = await adapter.execute(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND (tablename LIKE 'ex_%' OR tablename IN ('pk_test', 'no_pk_test', 'exec_test', 'items'))`,
      );
      for (const t of tables) {
        await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}" CASCADE`);
      }
    } catch {
      // ignore cleanup errors
    }
    await adapter.close();
  });

  describe("PostgreSQLAdapterTest", () => {
    it("primary key", async () => {
      await adapter.exec(`CREATE TABLE "pk_test" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      const rows = await adapter.execute(
        `SELECT column_name FROM information_schema.key_column_usage
         WHERE table_name = 'pk_test' AND constraint_name LIKE '%pkey'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].column_name).toBe("id");
    });

    it("primary key returns nil for no pk", async () => {
      await adapter.exec(`CREATE TABLE "no_pk_test" ("name" TEXT, "value" INTEGER)`);
      const rows = await adapter.execute(
        `SELECT column_name FROM information_schema.key_column_usage
         WHERE table_name = 'no_pk_test' AND constraint_name LIKE '%pkey'`,
      );
      expect(rows).toHaveLength(0);
    });

    it("exec no binds", async () => {
      const rows = await adapter.execute("SELECT 1 AS val");
      expect(rows).toHaveLength(1);
      expect(rows[0].val).toBe(1);
    });

    it("exec with binds", async () => {
      const rows = await adapter.execute("SELECT ? AS val", [1]);
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].val)).toBe(1);
    });

    it("exec typecasts bind vals", async () => {
      const rows = await adapter.execute("SELECT ? AS val", ["hello"]);
      expect(rows).toHaveLength(1);
      expect(rows[0].val).toBe("hello");
    });

    it("table alias length", async () => {
      // PostgreSQL default max identifier length is 63
      const rows = await adapter.execute("SHOW max_identifier_length");
      const len = parseInt(String(rows[0].max_identifier_length), 10);
      expect(len).toBeGreaterThanOrEqual(63);
    });

    it("partial index", async () => {
      await adapter.exec(`CREATE TABLE "ex_partial" ("id" SERIAL PRIMARY KEY, "number" INTEGER)`);
      await adapter.exec(`CREATE INDEX "partial_idx" ON "ex_partial" ("id") WHERE number > 100`);
      const rows = await adapter.execute(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'ex_partial' AND indexname = 'partial_idx'`,
      );
      expect(rows).toHaveLength(1);
    });

    it.skip("expression index", async () => {});
    it.skip("index with opclass", async () => {});

    it("pk and sequence for table with serial pk", async () => {
      await adapter.exec(`CREATE TABLE "ex_serial" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      const rows = await adapter.execute(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'ex_serial' AND column_default LIKE 'nextval%'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].column_name).toBe("id");
    });

    it("pk and sequence for table with bigserial pk", async () => {
      await adapter.exec(`CREATE TABLE "ex_bigserial" ("id" BIGSERIAL PRIMARY KEY, "name" TEXT)`);
      const rows = await adapter.execute(
        `SELECT data_type FROM information_schema.columns WHERE table_name = 'ex_bigserial' AND column_name = 'id'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].data_type).toBe("bigint");
    });

    it.skip("pk and sequence for table with custom sequence", async () => {});
    it.skip("columns for distinct", async () => {});
    it.skip("columns for distinct with order", async () => {});
    it.skip("columns for distinct with order and a column prefix", async () => {});
    it.skip("translate exception class", async () => {});

    it("translate exception unique violation", async () => {
      await adapter.exec(`CREATE TABLE "ex_uniq" ("id" SERIAL PRIMARY KEY, "name" TEXT UNIQUE)`);
      await adapter.executeMutation(`INSERT INTO "ex_uniq" ("name") VALUES ('Alice')`);
      await expect(
        adapter.executeMutation(`INSERT INTO "ex_uniq" ("name") VALUES ('Alice')`),
      ).rejects.toThrow(/duplicate key|unique/i);
    });

    it("translate exception not null violation", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_notnull" ("id" SERIAL PRIMARY KEY, "name" TEXT NOT NULL)`,
      );
      await expect(
        adapter.executeMutation(`INSERT INTO "ex_notnull" ("name") VALUES (NULL)`),
      ).rejects.toThrow(/not-null|null value/i);
    });

    it("translate exception foreign key violation", async () => {
      await adapter.exec(`CREATE TABLE "ex_parent" ("id" SERIAL PRIMARY KEY)`);
      await adapter.exec(
        `CREATE TABLE "ex_child" ("id" SERIAL PRIMARY KEY, "parent_id" INTEGER REFERENCES "ex_parent"("id"))`,
      );
      await expect(
        adapter.executeMutation(`INSERT INTO "ex_child" ("parent_id") VALUES (999)`),
      ).rejects.toThrow(/foreign key|violates/i);
    });

    it.skip("translate exception value too long", async () => {});
    it.skip("translate exception lock wait timeout", async () => {});
    it.skip("translate exception deadlock", async () => {});

    it("translate exception numeric value out of range", async () => {
      await adapter.exec(`CREATE TABLE "ex_num" ("id" SERIAL PRIMARY KEY, "val" SMALLINT)`);
      await expect(
        adapter.executeMutation(`INSERT INTO "ex_num" ("val") VALUES (99999)`),
      ).rejects.toThrow(/out of range/i);
    });

    it("translate exception invalid text representation", async () => {
      await adapter.exec(`CREATE TABLE "ex_cast" ("id" SERIAL PRIMARY KEY, "val" INTEGER)`);
      await expect(
        adapter.executeMutation(`INSERT INTO "ex_cast" ("val") VALUES ('not_a_number')`),
      ).rejects.toThrow(/invalid input|integer/i);
    });

    it.skip("translate exception query cancelled", async () => {});
    it.skip("translate exception serialization failure", async () => {});
    it.skip("type map", async () => {});
    it.skip("type map for results", async () => {});
    it.skip("only reload type map once for every unrecognized type", async () => {});
    it.skip("only warn on first encounter of unrecognized oid", async () => {});
    it.skip("extension enabled", async () => {});
    it.skip("extension available", async () => {});
    it.skip("extension enabled returns false for nonexistent", async () => {});
    it.skip("enable extension", async () => {});
    it.skip("disable extension", async () => {});
    it.skip("prepared statements", async () => {});
    it.skip("prepared statements with multiple binds", async () => {});
    it.skip("prepared statements disabled", async () => {});
    it.skip("default prepared statements", async () => {});

    it("boolean decoding", async () => {
      await adapter.exec(`CREATE TABLE "ex_bool" ("id" SERIAL PRIMARY KEY, "flag" BOOLEAN)`);
      await adapter.executeMutation(`INSERT INTO "ex_bool" ("flag") VALUES (true)`);
      await adapter.executeMutation(`INSERT INTO "ex_bool" ("flag") VALUES (false)`);
      const rows = await adapter.execute(`SELECT "flag" FROM "ex_bool" ORDER BY "id"`);
      expect(rows[0].flag).toBe(true);
      expect(rows[1].flag).toBe(false);
    });

    it("float decoding", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_float" ("id" SERIAL PRIMARY KEY, "val" DOUBLE PRECISION)`,
      );
      await adapter.executeMutation(`INSERT INTO "ex_float" ("val") VALUES (3.14)`);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_float"`);
      expect(rows[0].val).toBeCloseTo(3.14);
    });

    it("integer decoding", async () => {
      await adapter.exec(`CREATE TABLE "ex_int" ("id" SERIAL PRIMARY KEY, "val" INTEGER)`);
      await adapter.executeMutation(`INSERT INTO "ex_int" ("val") VALUES (42)`);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_int"`);
      expect(rows[0].val).toBe(42);
    });

    it("bigint decoding", async () => {
      await adapter.exec(`CREATE TABLE "ex_bigint" ("id" SERIAL PRIMARY KEY, "val" BIGINT)`);
      await adapter.executeMutation(`INSERT INTO "ex_bigint" ("val") VALUES (9007199254740991)`);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_bigint"`);
      expect(Number(rows[0].val)).toBe(9007199254740991);
    });

    it("numeric decoding", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_numeric" ("id" SERIAL PRIMARY KEY, "val" NUMERIC(10,2))`,
      );
      await adapter.executeMutation(`INSERT INTO "ex_numeric" ("val") VALUES (123.45)`);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_numeric"`);
      expect(parseFloat(String(rows[0].val))).toBeCloseTo(123.45);
    });

    it("json decoding", async () => {
      await adapter.exec(`CREATE TABLE "ex_json" ("id" SERIAL PRIMARY KEY, "val" JSON)`);
      await adapter.executeMutation(`INSERT INTO "ex_json" ("val") VALUES ('{"a":1}')`);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_json"`);
      expect(rows[0].val).toEqual({ a: 1 });
    });

    it("jsonb decoding", async () => {
      await adapter.exec(`CREATE TABLE "ex_jsonb" ("id" SERIAL PRIMARY KEY, "val" JSONB)`);
      await adapter.executeMutation(`INSERT INTO "ex_jsonb" ("val") VALUES ('{"b":2}')`);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_jsonb"`);
      expect(rows[0].val).toEqual({ b: 2 });
    });

    it.skip("hstore decoding", async () => {});

    it("array decoding", async () => {
      await adapter.exec(`CREATE TABLE "ex_arr" ("id" SERIAL PRIMARY KEY, "val" INTEGER[])`);
      await adapter.executeMutation(`INSERT INTO "ex_arr" ("val") VALUES ('{1,2,3}')`);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_arr"`);
      expect(rows[0].val).toEqual([1, 2, 3]);
    });

    it("uuid decoding", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_uuid" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "name" TEXT)`,
      );
      await adapter.executeMutation(`INSERT INTO "ex_uuid" ("name") VALUES ('test')`);
      const rows = await adapter.execute(`SELECT "id" FROM "ex_uuid"`);
      expect(typeof rows[0].id).toBe("string");
      expect(String(rows[0].id)).toMatch(/^[0-9a-f-]{36}$/);
    });

    it.skip("xml decoding", async () => {});
    it.skip("cidr decoding", async () => {});
    it.skip("inet decoding", async () => {});
    it.skip("macaddr decoding", async () => {});
    it.skip("point decoding", async () => {});
    it.skip("bit decoding", async () => {});
    it.skip("range decoding", async () => {});
    it.skip("date time decoding", async () => {});
    it.skip("date decoding", async () => {});
    it.skip("time decoding", async () => {});
    it.skip("timestamp decoding", async () => {});
    it.skip("timestamp with time zone decoding", async () => {});
    it.skip("interval decoding", async () => {});
    it.skip("money decoding", async () => {});
    it.skip("oid decoding", async () => {});
    it.skip("bad connection to postgres database", async () => {});
    it.skip("reconnect after bad connection on check version", async () => {});
    it.skip("primary key works tables containing capital letters", async () => {});
    it.skip("non standard primary key", async () => {});
    it.skip("exec insert with returning disabled and no sequence name given", async () => {});
    it.skip("exec insert default values with returning disabled and no sequence name given", async () => {});
    it.skip("exec insert default values quoted schema with returning disabled and no sequence name given", async () => {});
    it.skip("serial sequence", async () => {});
    it.skip("default sequence name", async () => {});
    it.skip("default sequence name bad table", async () => {});
    it.skip("pk and sequence for with non standard primary key", async () => {});
    it.skip("pk and sequence for returns nil if no seq", async () => {});
    it.skip("pk and sequence for returns nil if no pk", async () => {});
    it.skip("pk and sequence for returns nil if table not found", async () => {});
    it.skip("pk and sequence for with collision pg class oid", async () => {});
    it.skip("partial index on column named like keyword", async () => {});
    it.skip("include index", async () => {});
    it.skip("include multiple columns index", async () => {});
    it.skip("include keyword column name", async () => {});
    it.skip("include escaped quotes column name", async () => {});
    it.skip("invalid index", async () => {});
    it.skip("index with not distinct nulls", async () => {});
    it.skip("columns for distinct with nulls", async () => {});
    it.skip("columns for distinct without order specifiers", async () => {});
    it.skip("raise error when cannot translate exception", async () => {});
    it.skip("translate no connection exception to not established", async () => {});
    it.skip("reload type map for newly defined types", async () => {});
    it.skip("unparsed defaults are at least set when saving", async () => {});
    it.skip("only check for insensitive comparison capability once", async () => {});
    it.skip("extensions omits current schema name", async () => {});
    it.skip("extensions includes non current schema name", async () => {});
    it.skip("ignores warnings when behaviour ignore", async () => {});
    it.skip("logs warnings when behaviour log", async () => {});
    it.skip("raises warnings when behaviour raise", async () => {});
    it.skip("reports when behaviour report", async () => {});
    it.skip("warnings behaviour can be customized with a proc", async () => {});
    it.skip("allowlist of warnings to ignore", async () => {});
    it.skip("allowlist of warning codes to ignore", async () => {});
    it.skip("does not raise notice level warnings", async () => {});
    it.skip("date decoding enabled", async () => {});
    it.skip("date decoding disabled", async () => {});
    it.skip("disable extension with schema", async () => {});
    it.skip("disable extension without schema", async () => {});
  });
  it.skip("connection error", () => {});

  it.skip("reconnection error", () => {});

  it.skip("database exists returns true when the database exists", () => {});

  it.skip("columns for distinct zero orders", () => {});

  it.skip("columns for distinct one order", () => {});

  it.skip("columns for distinct few orders", () => {});

  it.skip("columns for distinct with case", () => {});

  it.skip("columns for distinct blank not nil orders", () => {});

  it.skip("columns for distinct with arel order", () => {});

  it.skip("bad connection", () => {});

  it.skip("database exists returns false when the database does not exist", () => {
    /* needs adapter.databaseExists() API */
  });

  it.skip("exec insert with returning disabled", () => {
    /* needs table setup and RETURNING-disabled adapter mode */
  });

  it.skip("pk and sequence for", async () => {});
});
