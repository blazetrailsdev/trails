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
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND (tablename LIKE 'ex_%' OR tablename IN ('pk_test', 'no_pk_test', 'exec_test', 'items', 'Items', 'Items'))`,
      );
      await adapter.exec(`DROP TABLE IF EXISTS "Items" CASCADE`);
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

    // ── Bind parameter rewriting + type round-trip ──────────────────────
    // Our adapter rewrites ? → $1, $2. These tests verify that bind params
    // work correctly with various PG types through INSERT and SELECT.

    it("boolean decoding", async () => {
      await adapter.exec(`CREATE TABLE "ex_bool" ("id" SERIAL PRIMARY KEY, "flag" BOOLEAN)`);
      await adapter.executeMutation(`INSERT INTO "ex_bool" ("flag") VALUES (?)`, [true]);
      await adapter.executeMutation(`INSERT INTO "ex_bool" ("flag") VALUES (?)`, [false]);
      const rows = await adapter.execute(
        `SELECT "flag" FROM "ex_bool" WHERE "flag" = ? ORDER BY "id"`,
        [true],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].flag).toBe(true);
    });

    it("float decoding", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_float" ("id" SERIAL PRIMARY KEY, "val" DOUBLE PRECISION)`,
      );
      await adapter.executeMutation(`INSERT INTO "ex_float" ("val") VALUES (?)`, [3.14]);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_float" WHERE "val" > ?`, [3.0]);
      expect(rows).toHaveLength(1);
      expect(rows[0].val).toBeCloseTo(3.14);
    });

    it("integer decoding", async () => {
      await adapter.exec(`CREATE TABLE "ex_int" ("id" SERIAL PRIMARY KEY, "val" INTEGER)`);
      // executeMutation with auto-RETURNING returns the inserted id
      const id = await adapter.executeMutation(`INSERT INTO "ex_int" ("val") VALUES (?)`, [42]);
      expect(id).toBeGreaterThan(0);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_int" WHERE "id" = ?`, [id]);
      expect(rows[0].val).toBe(42);
    });

    it("bigint decoding", async () => {
      await adapter.exec(`CREATE TABLE "ex_bigint" ("id" SERIAL PRIMARY KEY, "val" BIGINT)`);
      await adapter.executeMutation(
        `INSERT INTO "ex_bigint" ("val") VALUES (?)`,
        [9007199254740991],
      );
      const rows = await adapter.execute(`SELECT "val" FROM "ex_bigint"`);
      expect(Number(rows[0].val)).toBe(9007199254740991);
    });

    it("numeric decoding", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_numeric" ("id" SERIAL PRIMARY KEY, "val" NUMERIC(10,2))`,
      );
      await adapter.executeMutation(`INSERT INTO "ex_numeric" ("val") VALUES (?)`, [123.45]);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_numeric" WHERE "val" > ?`, [100]);
      expect(rows).toHaveLength(1);
      expect(parseFloat(String(rows[0].val))).toBeCloseTo(123.45);
    });

    it("json decoding", async () => {
      await adapter.exec(`CREATE TABLE "ex_json" ("id" SERIAL PRIMARY KEY, "val" JSON)`);
      const obj = { key: "value", nested: { a: 1 } };
      await adapter.executeMutation(`INSERT INTO "ex_json" ("val") VALUES (?)`, [
        JSON.stringify(obj),
      ]);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_json"`);
      expect(rows[0].val).toEqual(obj);
    });

    it("jsonb decoding", async () => {
      await adapter.exec(`CREATE TABLE "ex_jsonb" ("id" SERIAL PRIMARY KEY, "val" JSONB)`);
      await adapter.executeMutation(`INSERT INTO "ex_jsonb" ("val") VALUES (?)`, [
        JSON.stringify({ b: 2 }),
      ]);
      // JSONB supports containment queries via bind params
      const rows = await adapter.execute(`SELECT "val" FROM "ex_jsonb" WHERE "val" @> ?::jsonb`, [
        '{"b":2}',
      ]);
      expect(rows).toHaveLength(1);
      expect(rows[0].val).toEqual({ b: 2 });
    });

    it.skip("hstore decoding", async () => {});

    it("array decoding", async () => {
      await adapter.exec(`CREATE TABLE "ex_arr" ("id" SERIAL PRIMARY KEY, "val" INTEGER[])`);
      await adapter.executeMutation(`INSERT INTO "ex_arr" ("val") VALUES ('{1,2,3}')`);
      // Test bind param in ANY() array query
      const rows = await adapter.execute(`SELECT "val" FROM "ex_arr" WHERE ? = ANY("val")`, [2]);
      expect(rows).toHaveLength(1);
      expect(rows[0].val).toEqual([1, 2, 3]);
    });

    it("uuid decoding", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_uuid" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "name" TEXT)`,
      );
      await adapter.executeMutation(`INSERT INTO "ex_uuid" ("name") VALUES (?)`, ["test"]);
      const rows = await adapter.execute(`SELECT "id" FROM "ex_uuid" WHERE "name" = ?`, ["test"]);
      expect(typeof rows[0].id).toBe("string");
      expect(String(rows[0].id)).toMatch(/^[0-9a-f-]{36}$/);
    });

    // ── Transaction tests ─────────────────────────────────────────────
    // Our adapter manages transactions, savepoints, and rollbacks.

    it("xml decoding", async () => {
      await adapter.exec(`CREATE TABLE "ex_xml" ("id" SERIAL PRIMARY KEY, "val" XML)`);
      await adapter.executeMutation(`INSERT INTO "ex_xml" ("val") VALUES ('<root>hello</root>')`);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_xml"`);
      expect(String(rows[0].val)).toContain("<root>hello</root>");
    });

    it("cidr decoding", async () => {
      await adapter.exec(`CREATE TABLE "ex_cidr" ("id" SERIAL PRIMARY KEY, "val" CIDR)`);
      await adapter.executeMutation(`INSERT INTO "ex_cidr" ("val") VALUES ('192.168.1.0/24')`);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_cidr"`);
      expect(String(rows[0].val)).toBe("192.168.1.0/24");
    });

    it("inet decoding", async () => {
      await adapter.exec(`CREATE TABLE "ex_inet" ("id" SERIAL PRIMARY KEY, "val" INET)`);
      await adapter.executeMutation(`INSERT INTO "ex_inet" ("val") VALUES ('192.168.1.1')`);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_inet"`);
      expect(String(rows[0].val)).toBe("192.168.1.1");
    });

    it("macaddr decoding", async () => {
      await adapter.exec(`CREATE TABLE "ex_mac" ("id" SERIAL PRIMARY KEY, "val" MACADDR)`);
      await adapter.executeMutation(`INSERT INTO "ex_mac" ("val") VALUES ('08:00:2b:01:02:03')`);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_mac"`);
      expect(String(rows[0].val)).toBe("08:00:2b:01:02:03");
    });

    it("point decoding", async () => {
      await adapter.exec(`CREATE TABLE "ex_point" ("id" SERIAL PRIMARY KEY, "val" POINT)`);
      await adapter.executeMutation(`INSERT INTO "ex_point" ("val") VALUES ('(1.5, 2.5)')`);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_point"`);
      const val = rows[0].val;
      expect(val).toBeTruthy();
    });

    it("bit decoding", async () => {
      await adapter.exec(`CREATE TABLE "ex_bit" ("id" SERIAL PRIMARY KEY, "val" BIT(8))`);
      await adapter.executeMutation(`INSERT INTO "ex_bit" ("val") VALUES (B'10101010')`);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_bit"`);
      expect(String(rows[0].val)).toBe("10101010");
    });

    it.skip("range decoding", async () => {});

    it("date time decoding", async () => {
      const rows = await adapter.execute(`SELECT TIMESTAMP '2023-06-15 10:30:00' AS val`);
      expect(rows[0].val).toBeInstanceOf(Date);
    });

    it("date decoding", async () => {
      const rows = await adapter.execute(`SELECT DATE '2023-06-15' AS val`);
      expect(rows[0].val).toBeInstanceOf(Date);
    });

    it("time decoding", async () => {
      const rows = await adapter.execute(`SELECT TIME '14:30:00' AS val`);
      expect(rows[0].val).toBeTruthy();
      expect(String(rows[0].val)).toContain("14:30");
    });

    it("timestamp decoding", async () => {
      const rows = await adapter.execute(`SELECT TIMESTAMP '2023-06-15 10:30:00' AS val`);
      const d = rows[0].val as Date;
      expect(d).toBeInstanceOf(Date);
      expect(d.getFullYear()).toBe(2023);
    });

    it("timestamp with time zone decoding", async () => {
      const rows = await adapter.execute(`SELECT TIMESTAMPTZ '2023-06-15 10:30:00+00' AS val`);
      const d = rows[0].val as Date;
      expect(d).toBeInstanceOf(Date);
      expect(d.getFullYear()).toBe(2023);
    });

    it("interval decoding", async () => {
      const rows = await adapter.execute(`SELECT INTERVAL '1 day 2 hours' AS val`);
      expect(rows[0].val).toBeTruthy();
    });

    it("money decoding", async () => {
      const rows = await adapter.execute(`SELECT '$12.34'::money AS val`);
      expect(String(rows[0].val)).toContain("12.34");
    });

    it("oid decoding", async () => {
      const rows = await adapter.execute(`SELECT 42::oid AS val`);
      expect(Number(rows[0].val)).toBe(42);
    });

    it.skip("bad connection to postgres database", async () => {});
    it.skip("reconnect after bad connection on check version", async () => {});

    it("primary key works tables containing capital letters", async () => {
      await adapter.exec(`CREATE TABLE "Items" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      const pk = await adapter.primaryKey('"Items"');
      expect(pk).toBe("id");
    });

    it("non standard primary key", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_custom_pk" ("custom_id" SERIAL PRIMARY KEY, "name" TEXT)`,
      );
      const pk = await adapter.primaryKey("ex_custom_pk");
      expect(pk).toBe("custom_id");
    });

    it.skip("exec insert with returning disabled and no sequence name given", async () => {});
    it.skip("exec insert default values with returning disabled and no sequence name given", async () => {});
    it.skip("exec insert default values quoted schema with returning disabled and no sequence name given", async () => {});

    it("serial sequence", async () => {
      await adapter.exec(`CREATE TABLE "ex_serial_seq" ("id" SERIAL PRIMARY KEY)`);
      const result = await adapter.pkAndSequenceFor("ex_serial_seq");
      expect(result).not.toBeNull();
      expect(result![1].name).toBe("ex_serial_seq_id_seq");
    });

    it("default sequence name", async () => {
      await adapter.exec(`CREATE TABLE "ex_def_seq" ("id" SERIAL PRIMARY KEY)`);
      const result = await adapter.pkAndSequenceFor("ex_def_seq");
      expect(result).not.toBeNull();
      expect(result![1].name).toBe("ex_def_seq_id_seq");
    });

    it("default sequence name bad table", async () => {
      const result = await adapter.pkAndSequenceFor("nonexistent_table_xyz");
      expect(result).toBeNull();
    });

    it("pk and sequence for with non standard primary key", async () => {
      await adapter.exec(`CREATE TABLE "ex_ns_pk" ("custom_id" SERIAL PRIMARY KEY, "name" TEXT)`);
      const result = await adapter.pkAndSequenceFor("ex_ns_pk");
      expect(result).not.toBeNull();
      expect(result![0]).toBe("custom_id");
      expect(result![1].name).toBe("ex_ns_pk_custom_id_seq");
    });

    it("pk and sequence for returns nil if no seq", async () => {
      await adapter.exec(`CREATE TABLE "ex_no_seq" ("id" INTEGER PRIMARY KEY, "name" TEXT)`);
      const result = await adapter.pkAndSequenceFor("ex_no_seq");
      expect(result).toBeNull();
    });

    it("pk and sequence for returns nil if no pk", async () => {
      await adapter.exec(`CREATE TABLE "ex_no_pk" ("name" TEXT, "val" INTEGER)`);
      const result = await adapter.pkAndSequenceFor("ex_no_pk");
      expect(result).toBeNull();
    });

    it("pk and sequence for returns nil if table not found", async () => {
      const result = await adapter.pkAndSequenceFor("does_not_exist_xyz");
      expect(result).toBeNull();
    });
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

  // ── Transaction lifecycle tests ───────────────────────────────────
  describe("Transactions", () => {
    it("commit persists data", async () => {
      await adapter.exec(`CREATE TABLE "ex_txn" ("id" SERIAL PRIMARY KEY, "val" TEXT)`);
      await adapter.beginTransaction();
      await adapter.executeMutation(`INSERT INTO "ex_txn" ("val") VALUES ('committed')`);
      await adapter.commit();
      const rows = await adapter.execute(`SELECT "val" FROM "ex_txn"`);
      expect(rows).toHaveLength(1);
      expect(rows[0].val).toBe("committed");
    });

    it("rollback discards data", async () => {
      await adapter.exec(`CREATE TABLE "ex_txn_rb" ("id" SERIAL PRIMARY KEY, "val" TEXT)`);
      await adapter.executeMutation(`INSERT INTO "ex_txn_rb" ("val") VALUES ('before')`);
      await adapter.beginTransaction();
      await adapter.executeMutation(`INSERT INTO "ex_txn_rb" ("val") VALUES ('during')`);
      await adapter.rollback();
      const rows = await adapter.execute(`SELECT "val" FROM "ex_txn_rb"`);
      expect(rows).toHaveLength(1);
      expect(rows[0].val).toBe("before");
    });

    it("savepoint allows partial rollback", async () => {
      await adapter.exec(`CREATE TABLE "ex_txn_sp" ("id" SERIAL PRIMARY KEY, "val" TEXT)`);
      await adapter.beginTransaction();
      await adapter.executeMutation(`INSERT INTO "ex_txn_sp" ("val") VALUES ('a')`);
      await adapter.createSavepoint("sp1");
      await adapter.executeMutation(`INSERT INTO "ex_txn_sp" ("val") VALUES ('b')`);
      await adapter.rollbackToSavepoint("sp1");
      await adapter.executeMutation(`INSERT INTO "ex_txn_sp" ("val") VALUES ('c')`);
      await adapter.commit();
      const rows = await adapter.execute(`SELECT "val" FROM "ex_txn_sp" ORDER BY "id"`);
      expect(rows.map((r) => r.val)).toEqual(["a", "c"]);
    });
  });

  // ── executeMutation auto-RETURNING tests ──────────────────────────
  describe("executeMutation RETURNING", () => {
    it("returns inserted id for serial pk", async () => {
      await adapter.exec(`CREATE TABLE "ex_ret" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      const id1 = await adapter.executeMutation(`INSERT INTO "ex_ret" ("name") VALUES (?)`, [
        "first",
      ]);
      const id2 = await adapter.executeMutation(`INSERT INTO "ex_ret" ("name") VALUES (?)`, [
        "second",
      ]);
      expect(id1).toBe(1);
      expect(id2).toBe(2);
    });

    it("returns affected rows for UPDATE", async () => {
      await adapter.exec(`CREATE TABLE "ex_upd" ("id" SERIAL PRIMARY KEY, "val" INTEGER)`);
      await adapter.executeMutation(`INSERT INTO "ex_upd" ("val") VALUES (1)`);
      await adapter.executeMutation(`INSERT INTO "ex_upd" ("val") VALUES (2)`);
      await adapter.executeMutation(`INSERT INTO "ex_upd" ("val") VALUES (3)`);
      const affected = await adapter.executeMutation(
        `UPDATE "ex_upd" SET "val" = "val" + 10 WHERE "val" > ?`,
        [1],
      );
      expect(affected).toBe(2);
    });

    it("returns affected rows for DELETE", async () => {
      await adapter.exec(`CREATE TABLE "ex_del" ("id" SERIAL PRIMARY KEY, "val" INTEGER)`);
      await adapter.executeMutation(`INSERT INTO "ex_del" ("val") VALUES (1)`);
      await adapter.executeMutation(`INSERT INTO "ex_del" ("val") VALUES (2)`);
      await adapter.executeMutation(`INSERT INTO "ex_del" ("val") VALUES (3)`);
      const affected = await adapter.executeMutation(`DELETE FROM "ex_del" WHERE "val" < ?`, [3]);
      expect(affected).toBe(2);
    });

    it("handles INSERT with explicit RETURNING", async () => {
      await adapter.exec(`CREATE TABLE "ex_ret2" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      const id = await adapter.executeMutation(
        `INSERT INTO "ex_ret2" ("name") VALUES (?) RETURNING id`,
        ["test"],
      );
      expect(id).toBe(1);
    });
  });

  // ── Multiple bind parameter tests ─────────────────────────────────
  describe("Bind parameters", () => {
    it("rewrites multiple ? to $1 $2 $3", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_multi" ("id" SERIAL PRIMARY KEY, "a" TEXT, "b" INTEGER, "c" BOOLEAN)`,
      );
      await adapter.executeMutation(`INSERT INTO "ex_multi" ("a", "b", "c") VALUES (?, ?, ?)`, [
        "hello",
        42,
        true,
      ]);
      const rows = await adapter.execute(
        `SELECT * FROM "ex_multi" WHERE "a" = ? AND "b" > ? AND "c" = ?`,
        ["hello", 10, true],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].a).toBe("hello");
      expect(rows[0].b).toBe(42);
      expect(rows[0].c).toBe(true);
    });

    it("handles null bind values", async () => {
      await adapter.exec(`CREATE TABLE "ex_null" ("id" SERIAL PRIMARY KEY, "val" TEXT)`);
      await adapter.executeMutation(`INSERT INTO "ex_null" ("val") VALUES (?)`, [null]);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_null" WHERE "val" IS NULL`);
      expect(rows).toHaveLength(1);
      expect(rows[0].val).toBeNull();
    });
  });
});
