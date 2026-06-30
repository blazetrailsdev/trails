/**
 * trails-specific PostgreSQLAdapter invariants with no Rails counterpart.
 *
 * These guard behaviour that exists only in the trails port -- the bind-param
 * \`?\` -> \`$1\` rewriting, Temporal-based value decoding, PG-error -> ActiveRecord
 * exception translation, executeMutation auto-RETURNING, column reflection,
 * and the top-level adapter helpers. They were relocated verbatim out of
 * postgresql-adapter.test.ts (which mirrors postgresql_adapter_test.rb) so the
 * convention file tracks Rails 1:1.
 */
import pg from "pg";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
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
  ValueTooLong,
} from "../../errors.js";
import { withSecondAdapter } from "../../test-helpers/second-connection.js";

// Run `fn` with `ext` guaranteed disabled; restore the pre-state (enabled
// or disabled) on exit even if `fn` throws before tearing down whatever it
// created.
async function withExtensionDisabled(
  adapter: PostgreSQLAdapter,
  ext: string,
  fn: () => Promise<void>,
): Promise<void> {
  const wasEnabled = await adapter.extensionEnabled(ext);
  const ensureDisabled = wasEnabled ? () => adapter.disableExtension(ext) : async () => {};
  const restore = wasEnabled
    ? () => adapter.enableExtension(ext)
    : () => adapter.disableExtension(ext);
  await ensureDisabled();
  try {
    await fn();
  } finally {
    await restore();
  }
}

// PG 15+ supports NULLS NOT DISTINCT on unique indexes. The helpers below
// gate index creation + expected value on that version so the test body has
// no version branching.
const PG_NND_MIN_VERSION = 150000;

async function maybeCreateNullsNotDistinctIndex(adapter: PostgreSQLAdapter): Promise<void> {
  const version = await adapter.getDatabaseVersion();
  const creators = {
    supported: async () =>
      adapter.exec(
        `CREATE UNIQUE INDEX "ex_idx_opts_nnd" ON "ex_idx_opts" ("n") NULLS NOT DISTINCT`,
      ),
    unsupported: async () => {},
  };
  await creators[version >= PG_NND_MIN_VERSION ? "supported" : "unsupported"]();
}

async function expectedNullsNotDistinctValue(
  adapter: PostgreSQLAdapter,
): Promise<boolean | undefined> {
  const version = await adapter.getDatabaseVersion();
  return ({ supported: true, unsupported: undefined } as const)[
    version >= PG_NND_MIN_VERSION ? "supported" : "unsupported"
  ];
}

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    // Clean up test tables
    try {
      await adapter.exec(`DROP TABLE IF EXISTS "ExItems" CASCADE`);
      // Explicit teardown for every table this file creates via raw CREATE TABLE
      // (the dynamic `LIKE 'ex_%'` sweep below also drops them, but the static
      // list is what require-table-teardown balances against). IF EXISTS keeps
      // this idempotent and behavior-neutral.
      await adapter.exec(
        `DROP TABLE IF EXISTS pk_test, no_pk_test, ex_partial, ex_expr, ex_idx_opts, ex_opclass, ex_serial, ex_bigserial, ex_custom_seqt, ex_class, ex_uniq, ex_notnull, ex_parent, ex_child, ex_long, ex_lock, ex_dl, ex_num, ex_cast, ex_ser, ex_bool, ex_float, ex_int, ex_bigint, ex_numeric, ex_json, ex_jsonb, ex_backslash, ex_hs, ex_arr, ex_uuid, ex_xml, ex_cidr, ex_inet, ex_mac, ex_point, ex_bit, ex_rng, ex_custom_pk, ex_insert_ret, ex_insert_ret2, ex_insert_ret3, ex_insert_ret5, ex_serial_seq, ex_def_seq, ex_ns_pk, ex_no_seq, ex_no_pk, ex_keyword, ex_include, ex_include2, ex_incl_kw, ex_incl_esc, ex_invalid_idx, ex_nulls_nd, ex_unparsed_defaults, ex_dates, ex_insert_ret4, ex_pk_seq, ex_txn, ex_txn_rb, ex_txn_sp, ex_ret, ex_upd, ex_del, ex_ret2, ex_multi, ex_null, test_no_returning CASCADE`,
      );
      const tables = await adapter.execute(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND (tablename LIKE 'ex_%' OR tablename IN ('pk_test', 'no_pk_test', 'exec_test', 'ex_insert_ret', 'ex_insert_ret2', 'ex_insert_ret3', 'ex_insert_ret4', 'ex_insert_ret5'))`,
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
    it("indexes() returns where and nullsNotDistinct from definition", async () => {
      await adapter.exec(`CREATE TABLE "ex_idx_opts" ("id" SERIAL PRIMARY KEY, "n" INTEGER)`);
      await adapter.exec(`CREATE INDEX "ex_idx_opts_where" ON "ex_idx_opts" ("n") WHERE n > 0`);
      await maybeCreateNullsNotDistinctIndex(adapter);
      const indexes = await adapter.indexes("ex_idx_opts");
      const whereIdx = indexes.find((i) => i.name === "ex_idx_opts_where") as
        | { where?: string }
        | undefined;
      expect(whereIdx?.where).toMatch(/n > 0/);
      const nndIdx = indexes.find((i) => i.name === "ex_idx_opts_nnd") as
        | { nullsNotDistinct?: boolean }
        | undefined;
      expect(nndIdx?.nullsNotDistinct).toBe(await expectedNullsNotDistinctValue(adapter));
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
      expect(result![1]!.name).toBe("ex_custom_seq");
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
            .map((r) => r.reason);
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

    // db_warnings_action tests — flat under PostgreSQLAdapterTest to mirror
    // Rails (no sub-context). Hooks save/restore the static warnings config.
    let savedWarningsAction: typeof PostgreSQLAdapter.dbWarningsAction;
    let savedWarningsIgnore: typeof PostgreSQLAdapter.dbWarningsIgnore;
    beforeEach(() => {
      savedWarningsAction = PostgreSQLAdapter.dbWarningsAction;
      savedWarningsIgnore = PostgreSQLAdapter.dbWarningsIgnore;
    });
    afterEach(() => {
      PostgreSQLAdapter.dbWarningsAction = savedWarningsAction;
      PostgreSQLAdapter.dbWarningsIgnore = savedWarningsIgnore;
      vi.restoreAllMocks();
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
