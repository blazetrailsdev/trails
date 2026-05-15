/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/postgresql_adapter_test.rb
 */
import pg from "pg";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import * as Arel from "@blazetrails/arel";
import {
  ConnectionNotEstablished,
  Deadlocked,
  InvalidForeignKey,
  LockWaitTimeout,
  NotNullViolation,
  QueryCanceled,
  RangeError as ActiveRecordRangeError,
  RecordNotUnique,
  SerializationFailure,
  SQLWarning,
  ValueTooLong,
} from "../../errors.js";
import { withSecondAdapter } from "../../test-helpers/second-connection.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    // Clean up test tables
    try {
      await adapter.exec(`DROP TABLE IF EXISTS "Items" CASCADE`);
      const tables = await adapter.execute(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND (tablename LIKE 'ex_%' OR tablename IN ('pk_test', 'no_pk_test', 'exec_test', 'items', 'ex_insert_ret', 'ex_insert_ret2', 'ex_insert_ret3', 'ex_insert_ret4', 'ex_insert_ret5'))`,
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

    it("expression index", async () => {
      await adapter.exec(`CREATE TABLE "ex_expr" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      await adapter.addIndex("ex_expr", ["lower(name)"], { name: "idx_expr_lower_name" });
      const indexes = await adapter.indexes("ex_expr");
      const idx = indexes.find((i) => i.name === "idx_expr_lower_name");
      expect(idx).toBeDefined();
    });

    it("index with opclass", async () => {
      await adapter.exec(`CREATE TABLE "ex_opclass" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      await adapter.addIndex("ex_opclass", ["name"], {
        name: "idx_opclass_name",
        opclass: { name: "varchar_pattern_ops" },
      });
      const indexes = await adapter.indexes("ex_opclass");
      const idx = indexes.find((i) => i.name === "idx_opclass_name");
      expect(idx).toBeDefined();
    });

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

    it("pk and sequence for table with custom sequence", async () => {
      await adapter.exec(`DROP SEQUENCE IF EXISTS "ex_custom_seq" CASCADE`);
      await adapter.exec(`CREATE SEQUENCE "ex_custom_seq"`);
      await adapter.exec(
        `CREATE TABLE "ex_custom_seqt" ("id" INTEGER NOT NULL DEFAULT nextval('ex_custom_seq'), "name" TEXT, CONSTRAINT ex_custom_seqt_pkey PRIMARY KEY ("id"))`,
      );
      const result = await adapter.pkAndSequenceFor("ex_custom_seqt");
      expect(result).not.toBeNull();
      expect(result![0]).toBe("id");
      expect(result![1].name).toBe("ex_custom_seq");
    });

    it("columns for distinct", async () => {
      expect(adapter.columnsForDistinct("posts.id", [])).toBe("posts.id");
    });

    it("columns for distinct with order", async () => {
      expect(adapter.columnsForDistinct("posts.id", ["posts.created_at desc"])).toBe(
        "posts.created_at AS alias_0, posts.id",
      );
    });

    it("columns for distinct with order and a column prefix", async () => {
      expect(adapter.columnsForDistinct("posts.id", ["posts.created_at desc", "posts.title"])).toBe(
        "posts.created_at AS alias_0, posts.title AS alias_1, posts.id",
      );
    });
    it("translate exception class", async () => {
      await adapter.exec(`CREATE TABLE "ex_class" ("id" SERIAL PRIMARY KEY, "name" TEXT NOT NULL)`);
      await expect(
        adapter.executeMutation(`INSERT INTO "ex_class" ("name") VALUES (NULL)`),
      ).rejects.toBeInstanceOf(NotNullViolation);
    });

    it("translate exception unique violation", async () => {
      await adapter.exec(`CREATE TABLE "ex_uniq" ("id" SERIAL PRIMARY KEY, "name" TEXT UNIQUE)`);
      await adapter.executeMutation(`INSERT INTO "ex_uniq" ("name") VALUES ('Alice')`);
      await expect(
        adapter.executeMutation(`INSERT INTO "ex_uniq" ("name") VALUES ('Alice')`),
      ).rejects.toBeInstanceOf(RecordNotUnique);
    });

    it("translate exception not null violation", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_notnull" ("id" SERIAL PRIMARY KEY, "name" TEXT NOT NULL)`,
      );
      await expect(
        adapter.executeMutation(`INSERT INTO "ex_notnull" ("name") VALUES (NULL)`),
      ).rejects.toBeInstanceOf(NotNullViolation);
    });

    it("translate exception foreign key violation", async () => {
      await adapter.exec(`CREATE TABLE "ex_parent" ("id" SERIAL PRIMARY KEY)`);
      await adapter.exec(
        `CREATE TABLE "ex_child" ("id" SERIAL PRIMARY KEY, "parent_id" INTEGER REFERENCES "ex_parent"("id"))`,
      );
      await expect(
        adapter.executeMutation(`INSERT INTO "ex_child" ("parent_id") VALUES (999)`),
      ).rejects.toBeInstanceOf(InvalidForeignKey);
    });

    it("translate exception value too long", async () => {
      await adapter.exec(`CREATE TABLE "ex_long" ("id" SERIAL PRIMARY KEY, "name" VARCHAR(5))`);
      await expect(
        adapter.executeMutation(`INSERT INTO "ex_long" ("name") VALUES ('toolongvalue')`),
      ).rejects.toBeInstanceOf(ValueTooLong);
    });

    it("translate exception lock wait timeout", async () => {
      await adapter.exec(`CREATE TABLE "ex_lock" ("id" SERIAL PRIMARY KEY, "val" INTEGER)`);
      await adapter.executeMutation(`INSERT INTO "ex_lock" ("val") VALUES (1)`);
      await adapter.beginTransaction();
      try {
        await adapter.execute(`SELECT * FROM "ex_lock" WHERE id = 1 FOR UPDATE`);
        await withSecondAdapter(PG_TEST_URL, async (adapter2) => {
          await adapter2.beginTransaction();
          try {
            await adapter2.execute(`SET LOCAL lock_timeout = '100ms'`);
            await expect(
              adapter2.execute(`SELECT * FROM "ex_lock" WHERE id = 1 FOR UPDATE`),
            ).rejects.toBeInstanceOf(LockWaitTimeout);
          } finally {
            await adapter2.rollback();
          }
        });
      } finally {
        await adapter.rollback();
      }
    });
    it("translate exception deadlock", async () => {
      await adapter.exec(`CREATE TABLE "ex_dl" ("id" SERIAL PRIMARY KEY, "val" INTEGER)`);
      await adapter.executeMutation(`INSERT INTO "ex_dl" ("val") VALUES (1)`);
      await adapter.executeMutation(`INSERT INTO "ex_dl" ("val") VALUES (2)`);
      // conn1 locks row 1, conn2 locks row 2, then each tries to lock the other's row
      await withSecondAdapter(PG_TEST_URL, async (adapter2) => {
        await adapter.beginTransaction();
        await adapter2.beginTransaction();
        try {
          await adapter.execute(`SELECT * FROM "ex_dl" WHERE id = 1 FOR UPDATE`);
          await adapter2.execute(`SELECT * FROM "ex_dl" WHERE id = 2 FOR UPDATE`);
          const [result1, result2] = await Promise.allSettled([
            adapter.execute(`SELECT * FROM "ex_dl" WHERE id = 2 FOR UPDATE`),
            adapter2.execute(`SELECT * FROM "ex_dl" WHERE id = 1 FOR UPDATE`),
          ]);
          const errors = [result1, result2]
            .filter((r) => r.status === "rejected")
            .map((r) => (r as PromiseRejectedResult).reason);
          expect(errors.some((e) => e instanceof Deadlocked)).toBe(true);
        } finally {
          await adapter.rollback().catch(() => {});
          await adapter2.rollback().catch(() => {});
        }
      });
    });

    it("translate exception numeric value out of range", async () => {
      await adapter.exec(`CREATE TABLE "ex_num" ("id" SERIAL PRIMARY KEY, "val" SMALLINT)`);
      await expect(
        adapter.executeMutation(`INSERT INTO "ex_num" ("val") VALUES (99999)`),
      ).rejects.toBeInstanceOf(ActiveRecordRangeError);
    });

    it("translate exception invalid text representation", async () => {
      await adapter.exec(`CREATE TABLE "ex_cast" ("id" SERIAL PRIMARY KEY, "val" INTEGER)`);
      await expect(
        adapter.executeMutation(`INSERT INTO "ex_cast" ("val") VALUES ('not_a_number')`),
      ).rejects.toThrow(/invalid input|integer/i);
    });

    it("translate exception query cancelled", async () => {
      // Use a transaction so that pg_backend_pid() and pg_sleep() share the same
      // pooled connection — otherwise two execute() calls get different PG backends.
      await adapter.beginTransaction();
      try {
        const pidRows = await adapter.execute(`SELECT pg_backend_pid() AS pid`);
        const pid = (pidRows[0] as { pid: number }).pid;
        const sleepPromise = adapter.execute(`SELECT pg_sleep(10)`);
        // Attach a no-op handler synchronously so Node never flags this as an
        // unhandled rejection during the gap before the expect() runs.
        sleepPromise.catch(() => {});
        // Poll pg_stat_activity until the pg_sleep query is observed as active on
        // this backend, so the cancel always arrives after execution has started.
        await withSecondAdapter(PG_TEST_URL, async (adapter2) => {
          const deadline = Date.now() + 2000;
          while (Date.now() < deadline) {
            const rows = await adapter2.execute(
              `SELECT 1 FROM pg_stat_activity WHERE pid = ${pid} AND query LIKE '%pg_sleep%' AND state = 'active'`,
            );
            if (rows.length > 0) break;
            await new Promise<void>((r) => setTimeout(r, 10));
          }
          await adapter2.execute(`SELECT pg_cancel_backend(${pid})`);
        });
        await expect(sleepPromise).rejects.toBeInstanceOf(QueryCanceled);
      } finally {
        await adapter.rollback().catch(() => {});
      }
    });
    it("translate exception serialization failure", async () => {
      await adapter.exec(`CREATE TABLE "ex_ser" ("id" SERIAL PRIMARY KEY, "val" INTEGER)`);
      await adapter.executeMutation(`INSERT INTO "ex_ser" (val) VALUES (0)`);
      await withSecondAdapter(PG_TEST_URL, async (adapter2) => {
        // Both transactions get their snapshots before either commits.
        await adapter.beginIsolatedDbTransaction("serializable");
        await adapter2.beginIsolatedDbTransaction("serializable");
        try {
          // Both read the same row (establishes the SSI read-set).
          await adapter.execute(`SELECT * FROM "ex_ser"`);
          await adapter2.execute(`SELECT * FROM "ex_ser"`);
          // Both write to that row.
          await adapter.execute(`UPDATE "ex_ser" SET val = 1`);
          // adapter commits first.
          await adapter.commit();
          // adapter2's write waits for adapter's lock, then writes.
          await adapter2.execute(`UPDATE "ex_ser" SET val = 2`);
          // PG SSI detects the rw-anti-dependency cycle; one transaction must abort.
          await expect(adapter2.commit()).rejects.toBeInstanceOf(SerializationFailure);
        } catch (e) {
          await adapter.rollback().catch(() => {});
          await adapter2.rollback().catch(() => {});
          if (!(e instanceof SerializationFailure)) throw e;
        }
      });
    });
    it.skip("type map", async () => {
      // BLOCKED: typeMap is HashLookupTypeMap, not pg-driver PG::TypeMapByOid.
    });
    it.skip("type map for results", async () => {
      // BLOCKED: Same as "type map" — pg-driver type_map_for_results not exposed.
    });
    it.skip("only reload type map once for every unrecognized type", async () => {
      // BLOCKED: assert_queries_count needed; SQLCounter doesn't isolate pg_type queries.
    });
    it("only warn on first encounter of unrecognized oid", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        // execQuery goes through getOidType which triggers the dedup logic.
        // execute() bypasses OID resolution so it cannot trigger the warn.
        await adapter.execQuery(`select 'pg_catalog.pg_class'::regclass`);
        await adapter.execQuery(`select 'pg_catalog.pg_class'::regclass`);
        await adapter.execQuery(`select 'pg_catalog.pg_class'::regclass`);
        const oidWarns = warnSpy.mock.calls.filter(
          (c) => typeof c[0] === "string" && /unknown OID \d+/.test(c[0]),
        );
        expect(oidWarns).toHaveLength(1);
        expect(oidWarns[0][0]).toMatch(
          /unknown OID \d+: failed to recognize type of 'regclass'\. It will be treated as String\./,
        );
      } finally {
        warnSpy.mockRestore();
      }
    });
    it("extension enabled", async () => {
      await adapter.enableExtension("citext");
      expect(await adapter.extensionEnabled("citext")).toBe(true);
      await adapter.disableExtension("citext", { force: "cascade" });
    });

    it("extension available", async () => {
      expect(await adapter.extensionAvailable("hstore")).toBe(true);
      expect(await adapter.extensionAvailable("nonexistent_ext_xyz")).toBe(false);
    });

    it("extension enabled returns false for nonexistent", async () => {
      expect(await adapter.extensionEnabled("nonexistent_ext_xyz")).toBe(false);
    });

    it("enable extension", async () => {
      await adapter.disableExtension("citext", { force: "cascade" });
      expect(await adapter.extensionEnabled("citext")).toBe(false);
      await adapter.enableExtension("citext");
      expect(await adapter.extensionEnabled("citext")).toBe(true);
      await adapter.disableExtension("citext", { force: "cascade" });
    });

    it("disable extension", async () => {
      await adapter.enableExtension("citext");
      await adapter.disableExtension("citext", { force: "cascade" });
      expect(await adapter.extensionEnabled("citext")).toBe(false);
    });
    it("prepared statements", async () => {
      adapter.preparedStatements = true;
      await adapter.beginDbTransaction();
      try {
        await adapter.execute("SELECT $1::integer AS n", [1]);
        const rows = await adapter.execute("SELECT name FROM pg_prepared_statements");
        expect(rows.length).toBeGreaterThan(0);
      } finally {
        await adapter.rollback();
      }
    });
    it("prepared statements with multiple binds", async () => {
      adapter.preparedStatements = true;
      await adapter.beginDbTransaction();
      try {
        await adapter.execute("SELECT $1::integer + $2::integer AS n", [1, 2]);
        const rows = await adapter.execute("SELECT name FROM pg_prepared_statements");
        expect(rows.length).toBeGreaterThan(0);
      } finally {
        await adapter.rollback();
      }
    });
    it("prepared statements disabled", async () => {
      const a = new PostgreSQLAdapter({ connectionString: PG_TEST_URL, preparedStatements: false });
      try {
        expect(a.preparedStatements).toBe(false);
        const result = await a.execute("SELECT 1 AS n");
        expect(result[0]["n"]).toBe(1);
      } finally {
        await a.close();
      }
    });
    it("default prepared statements", async () => {
      const a = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        expect(a.preparedStatements).toBe(true);
      } finally {
        await a.close();
      }
    });

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
      // adapter.execute returns raw strings for json/jsonb; Json#deserialize owns parsing
      expect(JSON.parse(rows[0].val as string)).toEqual(obj);
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
      expect(JSON.parse(rows[0].val as string)).toEqual({ b: 2 });
    });

    it("backslash string round-trip", async () => {
      await adapter.exec(`CREATE TABLE "ex_backslash" ("id" SERIAL PRIMARY KEY, "val" TEXT)`);
      const value = "a\\b";
      await adapter.executeMutation(`INSERT INTO "ex_backslash" ("val") VALUES (?)`, [value]);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_backslash"`);
      expect(rows[0].val).toBe(value);
    });

    it("hstore decoding", async () => {
      await adapter.enableExtension("hstore");
      await adapter.exec(`CREATE TABLE "ex_hs" ("id" SERIAL PRIMARY KEY, "val" HSTORE)`);
      await adapter.executeMutation(`INSERT INTO "ex_hs" ("val") VALUES ('"a"=>"1", "b"=>"2"')`);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_hs"`);
      expect(typeof rows[0].val).toBe("string");
      expect(String(rows[0].val)).toContain("a");
    });

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

    it("range decoding", async () => {
      await adapter.exec(`CREATE TABLE "ex_rng" ("id" SERIAL PRIMARY KEY, "val" INT4RANGE)`);
      await adapter.executeMutation(`INSERT INTO "ex_rng" ("val") VALUES ('[1,10)')`);
      const rows = await adapter.execute(`SELECT "val" FROM "ex_rng"`);
      expect(typeof rows[0].val).toBe("string");
      expect(String(rows[0].val)).toContain("1");
    });

    it("date time decoding", async () => {
      const rows = await adapter.execute(`SELECT TIMESTAMP '2023-06-15 10:30:00' AS val`);
      expect(rows[0].val).toBeInstanceOf(Temporal.Instant);
    });

    it("date decoding", async () => {
      const rows = await adapter.execute(`SELECT DATE '2023-06-15' AS val`);
      expect(rows[0].val).toBeInstanceOf(Temporal.PlainDate);
    });

    it("time decoding", async () => {
      const rows = await adapter.execute(`SELECT TIME '14:30:00' AS val`);
      expect(rows[0].val).toBeTruthy();
      expect(String(rows[0].val)).toContain("14:30");
    });

    it("timestamp decoding", async () => {
      const rows = await adapter.execute(`SELECT TIMESTAMP '2023-06-15 10:30:00' AS val`);
      const d = rows[0].val as Temporal.Instant;
      expect(d).toBeInstanceOf(Temporal.Instant);
      expect(d.toZonedDateTimeISO("UTC").year).toBe(2023);
    });

    it("timestamp with time zone decoding", async () => {
      const rows = await adapter.execute(`SELECT TIMESTAMPTZ '2023-06-15 10:30:00+00' AS val`);
      const d = rows[0].val as Temporal.Instant;
      expect(d).toBeInstanceOf(Temporal.Instant);
      expect(d.toZonedDateTimeISO("UTC").year).toBe(2023);
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

    it("bad connection to postgres database", async () => {
      const bad = new PostgreSQLAdapter("postgres://localhost:59999/nonexistent");
      await expect(bad.execute("SELECT 1")).rejects.toThrow();
      await bad.close();
    });

    it("reconnection_error", async () => {
      // Mirrors Rails: test_reconnection_error — adapter raises ConnectionNotEstablished
      // when the underlying pool returns an error instead of a connection.
      const fakePool = {
        connect: () =>
          Promise.reject(Object.assign(new Error("connection lost"), { code: "57P01" })),
        end: () => Promise.resolve(),
        on: () => {},
        totalCount: 0,
        idleCount: 0,
        waitingCount: 0,
      };
      const a = new PostgreSQLAdapter(PG_TEST_URL);
      // Save original pool so it can be closed after injection — the constructor
      // creates a real pg.Pool immediately and close() would call end() on the fake.
      const originalPool = (a as any)._driverPool as pg.Pool | null;
      (a as any)._driverPool = fakePool;
      try {
        await expect(a.execute("SELECT 1")).rejects.toThrow(ConnectionNotEstablished);
      } finally {
        await originalPool?.end().catch(() => {});
      }
    });

    it.skip("reconnect after bad connection on check version", async () => {
      // BLOCKED: Rails stubs raw_connection.server_version=0 on the PG::Connection to
      // simulate a bad version check during reconnect!. Our adapter uses a pg.Pool
      // (accessible via _driverPoolForTest()) rather than a single PG::Connection, so
      // there is no equivalent low-level server_version stub point.
    });

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

    it("exec insert with returning disabled and no sequence name given", async () => {
      await adapter.exec(`CREATE TABLE "ex_insert_ret" ("id" SERIAL PRIMARY KEY, "number" INT)`);
      const noReturn = new PostgreSQLAdapter({
        connectionString: PG_TEST_URL,
        insertReturning: false,
      });
      try {
        const result = await noReturn.execInsert(
          `INSERT INTO "ex_insert_ret" ("number") VALUES (1)`,
          null,
          [],
          "id",
        );
        const rows = await noReturn.execute(`SELECT max(id) AS max_id FROM "ex_insert_ret"`);
        const maxId = Number(rows[0]["max_id"]);
        expect(Number((result as any).rows[0][0])).toBe(maxId);
      } finally {
        await noReturn.close();
      }
    });
    it("exec insert default values with returning disabled and no sequence name given", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_insert_ret2" ("id" SERIAL PRIMARY KEY, "number" INT DEFAULT 0)`,
      );
      const noReturn = new PostgreSQLAdapter({
        connectionString: PG_TEST_URL,
        insertReturning: false,
      });
      try {
        const result = await noReturn.execInsert(
          `INSERT INTO "ex_insert_ret2" DEFAULT VALUES`,
          null,
          [],
          "id",
        );
        const rows = await noReturn.execute(`SELECT max(id) AS max_id FROM "ex_insert_ret2"`);
        const maxId = Number(rows[0]["max_id"]);
        expect(Number((result as any).rows[0][0])).toBe(maxId);
      } finally {
        await noReturn.close();
      }
    });
    it("exec insert default values quoted schema with returning disabled and no sequence name given", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_insert_ret3" ("id" SERIAL PRIMARY KEY, "number" INT DEFAULT 0)`,
      );
      const noReturn = new PostgreSQLAdapter({
        connectionString: PG_TEST_URL,
        insertReturning: false,
      });
      try {
        const result = await noReturn.execInsert(
          `INSERT INTO "public"."ex_insert_ret3" DEFAULT VALUES`,
          null,
          [],
          "id",
        );
        const rows = await noReturn.execute(`SELECT max(id) AS max_id FROM "ex_insert_ret3"`);
        const maxId = Number(rows[0]["max_id"]);
        expect(Number((result as any).rows[0][0])).toBe(maxId);
      } finally {
        await noReturn.close();
      }
    });

    it("exec insert with returning disabled and no pk or sequence name given", async () => {
      await adapter.exec(`CREATE TABLE "ex_insert_ret5" ("id" SERIAL PRIMARY KEY, "number" INT)`);
      const noReturn = new PostgreSQLAdapter({
        connectionString: PG_TEST_URL,
        insertReturning: false,
      });
      try {
        const result = await noReturn.execInsert(
          `INSERT INTO "ex_insert_ret5" ("number") VALUES (1)`,
        );
        const rows = await noReturn.execute(`SELECT max(id) AS max_id FROM "ex_insert_ret5"`);
        const maxId = Number(rows[0]["max_id"]);
        expect(Number((result as any).rows[0][0])).toBe(maxId);
      } finally {
        await noReturn.close();
      }
    });

    it("exec insert with pk=false opt-out skips RETURNING and currval fallback", async () => {
      // Mirrors Rails: `if use_insert_returning? || pk == false`. With
      // pk === false PG must NOT auto-append `RETURNING id` (the path
      // executeMutation would otherwise take). Advance the SERIAL sequence
      // so the inserted id (101) can't be confused with a row-count of 1
      // — if the opt-out leaked, the result would be the id 101.
      await adapter.exec(`CREATE TABLE "ex_insert_pkfalse" ("id" SERIAL PRIMARY KEY, "n" INT)`);
      await adapter.exec(`SELECT setval(pg_get_serial_sequence('ex_insert_pkfalse', 'id'), 100)`);
      try {
        const result = await adapter.execInsert(
          `INSERT INTO "ex_insert_pkfalse" ("n") VALUES (42)`,
          null,
          [],
          false,
        );
        // execQuery returns a Result whose toArray() is empty when no
        // RETURNING is present (no rows projected back). If RETURNING
        // had leaked, the Result's first row first column would be 101.
        expect((result as { toArray(): unknown[] }).toArray?.()).toEqual([]);
        const rows = await adapter.execute(`SELECT id, n FROM "ex_insert_pkfalse"`);
        expect(rows[0].id).toBe(101);
        expect(rows[0].n).toBe(42);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS "ex_insert_pkfalse"`);
      }
    });

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
    it.skip("pk and sequence for with collision pg class oid", async () => {
      // BLOCKED: Requires superuser access to manipulate pg_depend for OID collision.
    });

    it("partial index on column named like keyword", async () => {
      await adapter.exec(`CREATE TABLE "ex_keyword" ("id" SERIAL PRIMARY KEY, "order" INTEGER)`);
      await adapter.addIndex("ex_keyword", ["order"], {
        name: "idx_keyword_order",
        where: '"order" > 10',
      });
      const indexes = await adapter.indexes("ex_keyword");
      expect(indexes.find((i) => i.name === "idx_keyword_order")).toBeDefined();
    });

    it("include index", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_include" ("id" SERIAL PRIMARY KEY, "name" TEXT, "email" TEXT)`,
      );
      await adapter.addIndex("ex_include", ["name"], {
        name: "idx_include_name",
        include: ["email"],
      });
      const indexes = await adapter.indexes("ex_include");
      expect(indexes.find((i) => i.name === "idx_include_name")).toBeDefined();
    });

    it("include multiple columns index", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_include2" ("id" SERIAL PRIMARY KEY, "a" TEXT, "b" TEXT, "c" TEXT)`,
      );
      await adapter.addIndex("ex_include2", ["a"], {
        name: "idx_include_multi",
        include: ["b", "c"],
      });
      const indexes = await adapter.indexes("ex_include2");
      expect(indexes.find((i) => i.name === "idx_include_multi")).toBeDefined();
    });

    it("include keyword column name", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_incl_kw" ("id" SERIAL PRIMARY KEY, "name" TEXT, "order" INTEGER)`,
      );
      await adapter.addIndex("ex_incl_kw", ["name"], {
        name: "idx_incl_kw",
        include: ["order"],
      });
      const indexes = await adapter.indexes("ex_incl_kw");
      expect(indexes.find((i) => i.name === "idx_incl_kw")).toBeDefined();
    });

    it("include escaped quotes column name", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_incl_esc" ("id" SERIAL PRIMARY KEY, "name" TEXT, "desc" TEXT)`,
      );
      await adapter.addIndex("ex_incl_esc", ["name"], {
        name: "idx_incl_esc",
        include: ["desc"],
      });
      const indexes = await adapter.indexes("ex_incl_esc");
      expect(indexes.find((i) => i.name === "idx_incl_esc")).toBeDefined();
    });

    it("invalid index", async () => {
      await adapter.exec(`CREATE TABLE "ex_invalid_idx" ("id" SERIAL PRIMARY KEY)`);
      await expect(
        adapter.addIndex("ex_invalid_idx", ["nonexistent_column"], { name: "idx_bad" }),
      ).rejects.toThrow();
    });

    it("index with not distinct nulls", async () => {
      await adapter.exec(`CREATE TABLE "ex_nulls_nd" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      await adapter.addIndex("ex_nulls_nd", ["name"], {
        name: "idx_nulls_nd",
        unique: true,
        nullsNotDistinct: true,
      });
      const indexes = await adapter.indexes("ex_nulls_nd");
      expect(indexes.find((i) => i.name === "idx_nulls_nd")).toBeDefined();
    });
    it("columns for distinct with nulls", async () => {
      expect(adapter.columnsForDistinct("posts.title", ["posts.updater_id desc nulls first"])).toBe(
        "posts.updater_id AS alias_0, posts.title",
      );
      expect(adapter.columnsForDistinct("posts.title", ["posts.updater_id desc nulls last"])).toBe(
        "posts.updater_id AS alias_0, posts.title",
      );
    });

    it("columns for distinct without order specifiers", async () => {
      expect(adapter.columnsForDistinct("posts.title", ["posts.updater_id"])).toBe(
        "posts.updater_id AS alias_0, posts.title",
      );
      expect(adapter.columnsForDistinct("posts.title", ["posts.updater_id nulls last"])).toBe(
        "posts.updater_id AS alias_0, posts.title",
      );
      expect(adapter.columnsForDistinct("posts.title", ["posts.updater_id nulls first"])).toBe(
        "posts.updater_id AS alias_0, posts.title",
      );
    });
    it("raise error when cannot translate exception", async () => {
      // execute(null) propagates TypeError unchanged (pg rejects null text; not a DatabaseError).
      await expect(adapter.execute(null as any)).rejects.toBeInstanceOf(TypeError);
    });
    it.skip("translate no connection exception to not established", async () => {
      // BLOCKED: pg_terminate_backend approach is inherently racy — pg.Pool reconnects
      // transparently after a backend is killed, so the subsequent execute() may succeed
      // instead of raising ConnectionNotEstablished. Rails avoids this by calling
      // raw_connection.send_query() directly on a PG::Connection (no pool), but pg npm
      // has no send_query equivalent. A reliable implementation requires holding an open
      // pg.Client (not pool), terminating it, and exercising the error-translation path
      // directly. 57P01 → ConnectionNotEstablished translation is verified by the
      // reconnection_error test above (fake pool injection path).
    });
    it("reload type map for newly defined types", async () => {
      const { Enum: OidEnum } = await import("../../connection-adapters/postgresql/oid/enum.js");
      await adapter.createEnum("feeling", ["good", "bad"]);
      try {
        const result = await adapter.execQuery(`SELECT 'good'::feeling AS feeling`);
        expect(result.columnTypes["feeling"]).toBeInstanceOf(OidEnum);
      } finally {
        await adapter.dropEnum("feeling", { ifExists: true });
      }
    });
    it("unparsed defaults are at least set when saving", async () => {
      await adapter.exec(
        `CREATE TABLE "ex_unparsed_defaults" (id SERIAL PRIMARY KEY, number INTEGER NOT NULL DEFAULT (4 + 4) * 2 / 4)`,
      );
      const cols = await adapter.columns("ex_unparsed_defaults");
      const numberCol = cols.find((c) => c.name === "number")!;
      // Rails: arithmetic-expression defaults — extract_value_from_default and
      // extract_default_function both return nil; the column carries neither a
      // literal default nor a SQL function. The DB still applies the default
      // on INSERT, so save! must NOT emit `number = NULL`.
      expect(numberCol.default).toBeNull();
      expect(numberCol.defaultFunction == null).toBe(true);
      await adapter.exec(`INSERT INTO "ex_unparsed_defaults" DEFAULT VALUES`);
      const rows = await adapter.execute(`SELECT number FROM "ex_unparsed_defaults"`);
      expect(Number(rows[0].number)).toBe(4);
    });
    it("only check for insensitive comparison capability once", async () => {
      await adapter.execute(`CREATE DOMAIN example_type AS integer`);
      const schemaQuerySpy = vi.spyOn(adapter, "schemaQuery");
      try {
        // canPerformCaseInsensitiveComparisonFor does the pg_proc lookup via schemaQuery.
        // Spy on schemaQuery to verify the cache prevents a second DB round-trip.
        const col = { sqlType: "example_type" };
        await adapter.canPerformCaseInsensitiveComparisonFor(col);
        const callsAfterFirst = schemaQuerySpy.mock.calls.length;
        await adapter.canPerformCaseInsensitiveComparisonFor(col);
        expect(schemaQuerySpy.mock.calls.length).toBe(callsAfterFirst);
      } finally {
        schemaQuerySpy.mockRestore();
        await adapter.execute(`DROP DOMAIN example_type CASCADE`);
      }
    });
    it("extensions omits current schema name", async () => {
      const wasEnabled = await adapter.extensionEnabled("hstore");
      if (wasEnabled) await adapter.disableExtension("hstore");
      await adapter.exec(`CREATE SCHEMA IF NOT EXISTS customschema`);
      try {
        await adapter.exec(`CREATE EXTENSION hstore SCHEMA customschema`);
        const exts = await adapter.extensions();
        expect(exts).toContain("customschema.hstore");
      } finally {
        await adapter.exec(`DROP SCHEMA IF EXISTS customschema CASCADE`);
        if (wasEnabled) await adapter.enableExtension("hstore");
      }
    });

    it("extensions includes non current schema name", async () => {
      const wasEnabled = await adapter.extensionEnabled("hstore");
      const currentSchemaRows = await adapter.execute(
        `SELECT quote_ident(current_schema()) AS quoted_current_schema`,
      );
      const quotedCurrentSchema = currentSchemaRows[0].quoted_current_schema as string;
      if (wasEnabled) await adapter.disableExtension("hstore");
      try {
        await adapter.exec(`CREATE EXTENSION hstore SCHEMA ${quotedCurrentSchema}`);
        const exts = await adapter.extensions();
        expect(exts).toContain("hstore");
      } finally {
        await adapter.exec(`DROP EXTENSION IF EXISTS hstore`);
        if (wasEnabled) await adapter.enableExtension("hstore");
      }
    });
    describe("db_warnings_action", () => {
      let savedAction: typeof PostgreSQLAdapter.dbWarningsAction;
      let savedIgnore: typeof PostgreSQLAdapter.dbWarningsIgnore;
      beforeEach(() => {
        savedAction = PostgreSQLAdapter.dbWarningsAction;
        savedIgnore = PostgreSQLAdapter.dbWarningsIgnore;
      });
      afterEach(() => {
        PostgreSQLAdapter.dbWarningsAction = savedAction;
        PostgreSQLAdapter.dbWarningsIgnore = savedIgnore;
        vi.restoreAllMocks();
      });

      it("ignores warnings when behaviour ignore", async () => {
        PostgreSQLAdapter.dbWarningsAction = "ignore";
        const rows = await adapter.execute("do $$ BEGIN RAISE WARNING 'foo'; END; $$");
        expect(rows).toEqual([]);
      });

      it("logs warnings when behaviour log", async () => {
        PostgreSQLAdapter.dbWarningsAction = "log";
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        await adapter.execute("do $$ BEGIN RAISE WARNING 'PostgreSQL SQL warning'; END; $$");
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("PostgreSQL SQL warning"));
      });

      it("raises warnings when behaviour raise", async () => {
        PostgreSQLAdapter.dbWarningsAction = "raise";
        await expect(
          adapter.execute("do $$ BEGIN RAISE WARNING 'PostgreSQL SQL warning'; END; $$"),
        ).rejects.toBeInstanceOf(SQLWarning);
      });

      it("reports when behaviour report", async () => {
        const { ErrorReporter, setErrorReporter } = await import("@blazetrails/activesupport");
        PostgreSQLAdapter.dbWarningsAction = "report";
        const reporter = new ErrorReporter();
        const events: Array<{ error: Error; handled: boolean }> = [];
        reporter.subscribe({
          report: ({ error, handled }) => {
            events.push({ error, handled });
          },
        });
        setErrorReporter(reporter);
        try {
          await adapter.execute("do $$ BEGIN RAISE WARNING 'PostgreSQL SQL warning'; END; $$");
          expect(events).toHaveLength(1);
          expect(events[0].error).toBeInstanceOf(SQLWarning);
          expect(events[0].error.message).toBe("PostgreSQL SQL warning");
          expect(events[0].handled).toBe(true);
        } finally {
          setErrorReporter(null);
        }
      });

      it("warnings behaviour can be customized with a proc", async () => {
        let captured: SQLWarning | null = null;
        PostgreSQLAdapter.dbWarningsAction = (w) => {
          captured = w as SQLWarning;
        };
        await adapter.execute("do $$ BEGIN RAISE WARNING 'PostgreSQL SQL warning'; END; $$");
        expect(captured).toBeInstanceOf(SQLWarning);
        expect((captured as unknown as SQLWarning).message).toBe("PostgreSQL SQL warning");
        expect((captured as unknown as SQLWarning).level).toBe("WARNING");
      });

      it("allowlist of warnings to ignore", async () => {
        PostgreSQLAdapter.dbWarningsAction = "raise";
        PostgreSQLAdapter.dbWarningsIgnore = [/PostgreSQL SQL warning/];
        const rows = await adapter.execute(
          "do $$ BEGIN RAISE WARNING 'PostgreSQL SQL warning'; END; $$",
        );
        expect(rows).toEqual([]);
      });

      it("allowlist of warning codes to ignore", async () => {
        PostgreSQLAdapter.dbWarningsAction = "raise";
        PostgreSQLAdapter.dbWarningsIgnore = ["01000"];
        const rows = await adapter.execute(
          "do $$ BEGIN RAISE WARNING 'PostgreSQL SQL warning'; END; $$",
        );
        expect(rows).toEqual([]);
      });

      it("does not raise notice level warnings", async () => {
        PostgreSQLAdapter.dbWarningsAction = "raise";
        // DROP TABLE IF EXISTS fires a NOTICE (not WARNING) — must not raise
        await expect(
          adapter.execute("DROP TABLE IF EXISTS non_existent_table_xyz_warnings"),
        ).resolves.toBeDefined();
      });
    });
    it("date decoding enabled", async () => {
      await adapter.exec(`CREATE TABLE "ex_dates" ("id" SERIAL PRIMARY KEY, "d" DATE)`);
      await adapter.exec(`INSERT INTO "ex_dates" ("d") VALUES ('2023-06-15')`);
      const rows = await adapter.execute(`SELECT "d" FROM "ex_dates"`);
      const d = rows[0].d as Temporal.PlainDate;
      expect(d).toBeInstanceOf(Temporal.PlainDate);
      expect(d.year).toBe(2023);
      expect(d.month).toBe(6);
      expect(d.day).toBe(15);
    });

    it("date decoding disabled", async () => {
      const saved = PostgreSQLAdapter.decodeDates;
      PostgreSQLAdapter.decodeDates = false;
      const localAdapter = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        await localAdapter.exec(`CREATE TABLE "ex_dates_off" ("id" SERIAL PRIMARY KEY, "d" DATE)`);
        await localAdapter.exec(`INSERT INTO "ex_dates_off" ("d") VALUES ('2024-01-01')`);
        const rows = await localAdapter.execute(`SELECT "d" FROM "ex_dates_off"`);
        expect(rows[0].d).toBe("2024-01-01");
      } finally {
        await localAdapter.exec(`DROP TABLE IF EXISTS "ex_dates_off"`);
        await localAdapter.close();
        PostgreSQLAdapter.decodeDates = saved;
      }
    });

    it("disable extension with schema", async () => {
      const wasEnabled = await adapter.extensionEnabled("hstore");
      if (wasEnabled) await adapter.disableExtension("hstore");
      await adapter.exec(`CREATE SCHEMA IF NOT EXISTS "ex_extensions"`);
      try {
        await adapter.exec(`CREATE EXTENSION "hstore" WITH SCHEMA "ex_extensions"`);
        const before = await adapter.extensionEnabled("hstore");
        expect(before).toBe(true);
        await adapter.disableExtension("hstore", { schema: "ex_extensions" });
        const after = await adapter.extensionEnabled("hstore");
        expect(after).toBe(false);
      } finally {
        await adapter.exec(`DROP SCHEMA IF EXISTS "ex_extensions" CASCADE`);
        if (wasEnabled) await adapter.enableExtension("hstore");
      }
    });

    it("disable extension without schema", async () => {
      const wasEnabled = await adapter.extensionEnabled("hstore");
      if (!wasEnabled) await adapter.enableExtension("hstore");
      try {
        await adapter.disableExtension("hstore");
        const enabled = await adapter.extensionEnabled("hstore");
        expect(enabled).toBe(false);
      } finally {
        if (wasEnabled) await adapter.enableExtension("hstore");
      }
    });
    it("connection error", async () => {
      const bad = new PostgreSQLAdapter("postgres://localhost:59999/nonexistent");
      await expect(bad.execute("SELECT 1")).rejects.toThrow();
      await bad.close();
    });

    it.skip("reconnection error", () => {
      // BLOCKED: Rails creates a fake PG::Connection object with a reset() that
      // throws PG::ConnectionBad, then stubs PG.connect to throw. The pg npm
      // driver doesn't expose equivalent interception points.
    });

    it("database exists returns true when the database exists", async () => {
      const [{ current_database }] = await adapter.execute(
        `SELECT current_database() AS current_database`,
      );
      const exists = await adapter.databaseExists(current_database as string);
      expect(exists).toBe(true);
    });

    it("columns for distinct zero orders", () => {
      expect(adapter.columnsForDistinct("posts.id", [])).toBe("posts.id");
    });

    it("columns for distinct one order", () => {
      expect(adapter.columnsForDistinct("posts.id", ["posts.created_at desc"])).toBe(
        "posts.created_at AS alias_0, posts.id",
      );
    });

    it("columns for distinct few orders", () => {
      expect(
        adapter.columnsForDistinct("posts.id", ["posts.created_at desc", "posts.position asc"]),
      ).toBe("posts.created_at AS alias_0, posts.position AS alias_1, posts.id");
    });

    it("columns for distinct with case", () => {
      expect(
        adapter.columnsForDistinct("posts.id", [
          "CASE WHEN author.is_active THEN UPPER(author.name) ELSE UPPER(author.email) END",
        ]),
      ).toBe(
        "CASE WHEN author.is_active THEN UPPER(author.name) ELSE UPPER(author.email) END AS alias_0, posts.id",
      );
    });

    it("columns for distinct blank not nil orders", () => {
      expect(adapter.columnsForDistinct("posts.id", ["posts.created_at desc", "", "   "])).toBe(
        "posts.created_at AS alias_0, posts.id",
      );
    });

    it("columns for distinct with arel order", () => {
      const order = new Arel.Nodes.Descending(Arel.sql("posts.created_at"));
      expect(adapter.columnsForDistinct("posts.id", [order])).toBe(
        "posts.created_at AS alias_0, posts.id",
      );
    });

    it("bad connection", async () => {
      const bad = new PostgreSQLAdapter("postgres://localhost:59999/nonexistent");
      await expect(bad.execute("SELECT 1")).rejects.toThrow();
      await bad.close();
    });

    it("database exists returns false when the database does not exist", async () => {
      const exists = await adapter.databaseExists("nonexistent_db_xyz_12345");
      expect(exists).toBe(false);
    });
    it("exec insert with returning disabled", async () => {
      await adapter.exec(`CREATE TABLE "ex_insert_ret4" ("id" SERIAL PRIMARY KEY, "number" INT)`);
      const noReturn = new PostgreSQLAdapter({
        connectionString: PG_TEST_URL,
        insertReturning: false,
      });
      try {
        const result = await noReturn.execInsert(
          `INSERT INTO "ex_insert_ret4" ("number") VALUES (1)`,
          null,
          [],
          "id",
          "ex_insert_ret4_id_seq",
        );
        const rows = await noReturn.execute(`SELECT max(id) AS max_id FROM "ex_insert_ret4"`);
        const maxId = Number(rows[0]["max_id"]);
        expect(Number((result as any).rows[0][0])).toBe(maxId);
      } finally {
        await noReturn.close();
      }
    });

    it("pk and sequence for", async () => {
      await adapter.exec(`CREATE TABLE "ex_pk_seq" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      const result = await adapter.pkAndSequenceFor("ex_pk_seq");
      expect(result).not.toBeNull();
      expect(result![0]).toBe("id");
    });
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

  // ── Column reflection ──────────────────────────────────────────────
  describe("Column reflection", () => {
    afterEach(async () => {
      await adapter.execute(`DROP TABLE IF EXISTS col_reflection_test CASCADE`);
      await adapter.execute(`DROP TYPE IF EXISTS col_reflection_mood CASCADE`);
    });

    it("reflects identity column", async () => {
      await adapter.execute(`
        CREATE TABLE col_reflection_test (
          id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          name TEXT
        )
      `);
      const cols = await adapter.columns("col_reflection_test");
      const id = cols.find((c) => c.name === "id")!;
      expect(id.isIdentity).toBe(true);
      expect(id.isAutoIncrementedByDb()).toBe(true);
    });

    it("reflects generated (virtual stored) column", async () => {
      await adapter.execute(`
        CREATE TABLE col_reflection_test (
          id  SERIAL PRIMARY KEY,
          a   INT NOT NULL,
          b   INT NOT NULL,
          sum INT GENERATED ALWAYS AS (a + b) STORED
        )
      `);
      const cols = await adapter.columns("col_reflection_test");
      const sum = cols.find((c) => c.name === "sum")!;
      expect(sum.isVirtual()).toBe(true);
      expect(sum.hasDefault).toBe(false);
      expect(sum.defaultFunction).toBeTruthy();
    });

    it("reflects array column — sqlType strips [] and array flag is true", async () => {
      await adapter.execute(`
        CREATE TABLE col_reflection_test (
          id   SERIAL PRIMARY KEY,
          tags TEXT[]
        )
      `);
      const cols = await adapter.columns("col_reflection_test");
      const tags = cols.find((c) => c.name === "tags")!;
      expect(tags.array).toBe(true);
      expect(tags.sqlType).toBe("text");
    });

    it("reflects enum column — isEnum is true", async () => {
      await adapter.execute(`CREATE TYPE col_reflection_mood AS ENUM ('happy', 'sad')`);
      await adapter.execute(`
        CREATE TABLE col_reflection_test (
          id   SERIAL PRIMARY KEY,
          mood col_reflection_mood
        )
      `);
      // Reload the OID type map so the newly created enum type is registered.
      await adapter.loadAdditionalTypes();
      const cols = await adapter.columns("col_reflection_test");
      const mood = cols.find((c) => c.name === "mood")!;
      expect(mood.isEnum).toBe(true);
    });
  });

  // ── DatabaseStatements ────────────────────────────────────────────
  describe("DatabaseStatements", () => {
    it("isWriteQuery returns false for read-like statements", () => {
      expect(adapter.isWriteQuery("SELECT 1")).toBe(false);
      expect(adapter.isWriteQuery("SET search_path TO public")).toBe(false);
      expect(adapter.isWriteQuery("SHOW server_version")).toBe(false);
    });

    it("highPrecisionCurrentTimestamp returns CURRENT_TIMESTAMP literal", () => {
      const ts = adapter.highPrecisionCurrentTimestamp();
      expect(ts.toSql()).toBe("CURRENT_TIMESTAMP");
    });

    it("setConstraints ALL DEFERRED executes without error", async () => {
      await adapter.beginTransaction();
      try {
        await expect(adapter.setConstraints("deferred")).resolves.toBeUndefined();
      } finally {
        await adapter.commit();
      }
    });

    it("setConstraints rejects invalid deferred value", async () => {
      await expect(adapter.setConstraints("invalid" as "deferred" | "immediate")).rejects.toThrow();
    });

    it("beginIsolatedDbTransaction starts a transaction with isolation level", async () => {
      await adapter.beginIsolatedDbTransaction("serializable");
      try {
        const rows = await adapter.execute(
          `SELECT current_setting('transaction_isolation') AS iso`,
        );
        expect((rows[0] as { iso: string }).iso.toLowerCase()).toBe("serializable");
      } finally {
        await adapter.commit();
      }
    });
  });

  // ── Top-level adapter methods (PR C) ──────────────────────────────
  describe("PostgreSQLAdapter top-level methods", () => {
    it("nativeDatabaseTypes includes expected pg types", () => {
      const types = PostgreSQLAdapter.nativeDatabaseTypes();
      expect(types.string).toEqual({ name: "character varying" });
      expect(types.binary).toEqual({ name: "bytea" });
      expect(types.primaryKey).toBe("bigserial primary key");
      expect(types.datetime).toBeDefined();
    });

    it("nativeDatabaseTypes datetime resolves from datetimeType", () => {
      const original = PostgreSQLAdapter.datetimeType;
      try {
        PostgreSQLAdapter.datetimeType = "timestamptz";
        const types = PostgreSQLAdapter.nativeDatabaseTypes();
        expect(types.datetime).toEqual({ name: "timestamptz" });
      } finally {
        PostgreSQLAdapter.datetimeType = original;
      }
    });

    it("isUseInsertReturning defaults to true", () => {
      expect(adapter.isUseInsertReturning()).toBe(true);
    });

    it("isUseInsertReturning reflects insertReturning config", async () => {
      const a = new PostgreSQLAdapter({
        connectionString: PG_TEST_URL,
        insertReturning: false,
      });
      try {
        expect(a.isUseInsertReturning()).toBe(false);
      } finally {
        await a.close();
      }
    });

    it("insert with insertReturning disabled returns rowCount not id", async () => {
      const a = new PostgreSQLAdapter({
        connectionString: PG_TEST_URL,
        insertReturning: false,
      });
      try {
        await a.execute(
          `CREATE TEMP TABLE test_no_returning (id bigserial primary key, title text)`,
        );
        const result = await a.executeMutation(
          `INSERT INTO test_no_returning (title) VALUES ('hello')`,
        );
        expect(result).toBe(1);
      } finally {
        await a.close();
      }
    });

    it("maxIdentifierLength returns a positive integer", async () => {
      const len = await adapter.maxIdentifierLength();
      expect(len).toBeGreaterThan(0);
      expect(Number.isInteger(len)).toBe(true);
    });

    it("maxIdentifierLength is cached after first call", async () => {
      const first = await adapter.maxIdentifierLength();
      const second = await adapter.maxIdentifierLength();
      expect(first).toBe(second);
    });

    it("enumTypes returns enum types from the database", async () => {
      await adapter.execute(`DROP TYPE IF EXISTS pr_c_mood`);
      await adapter.execute(`CREATE TYPE pr_c_mood AS ENUM ('happy', 'sad')`);
      try {
        await adapter.loadAdditionalTypes();
        const types = await adapter.enumTypes();
        const entry = types.find(([name]) => name === "pr_c_mood");
        expect(entry).toBeDefined();
        expect(entry![1]).toContain("happy");
        expect(entry![1]).toContain("sad");
      } finally {
        await adapter.execute(`DROP TYPE IF EXISTS pr_c_mood`);
      }
    });

    it("setStandardConformingStrings executes without error", async () => {
      await expect(adapter.setStandardConformingStrings()).resolves.toBeUndefined();
    });

    it("sessionAuth changes the session authorization", async () => {
      const rows = await adapter.execute("SELECT current_user");
      const currentUser = (rows[0] as { current_user: string }).current_user;
      try {
        await expect(adapter.sessionAuth(currentUser)).resolves.toBeUndefined();
      } finally {
        await adapter.sessionAuth("DEFAULT");
      }
    });

    it("newClient connects and returns a pg.Client instance", async () => {
      const client = await PostgreSQLAdapter.newClient({
        connectionString: PG_TEST_URL,
      });
      expect(client).toBeInstanceOf(pg.Client);
      await client.end();
    });

    it("newClient translates unknown host errors to ConnectionNotEstablished", async () => {
      await expect(
        PostgreSQLAdapter.newClient({
          host: "nonexistent.invalid",
          database: "testdb",
          port: 5432,
          connectionTimeoutMillis: 1000,
        }),
      ).rejects.toBeInstanceOf(ConnectionNotEstablished);
    });
  });
});
