import pg from "pg";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Temporal } from "@blazetrails/date";
import { ActiveRecord } from "../../ar-config.js";
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
import { withSecondAdapter } from "../../support/second-connection.js";
import { Column as PgColumn } from "../../connection-adapters/postgresql/column.js";
import { captureSql } from "../../testing/sql-capture.js";
import { itIfSupports } from "../../support/supports.js";

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
    try {
      await adapter.exec(`DROP TABLE IF EXISTS abba, test_no_returning CASCADE`);

      const tables = await adapter.execute(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'ex_%'`,
      );
      for (const t of tables) {
        await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}" CASCADE`);
      }
    } catch {}
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

    itIfSupports(
      "index_include",
      "indexes() keeps INCLUDE columns out of the key column list",
      async () => {
        await adapter.exec(
          `CREATE TABLE "ex_idx_incl" ("id" SERIAL PRIMARY KEY, "n" INTEGER, "d" TEXT)`,
        );
        await adapter.exec(`CREATE INDEX "ex_idx_incl_i" ON "ex_idx_incl" ("n") INCLUDE ("d")`);
        const index = (await adapter.indexes("ex_idx_incl")).find(
          (i) => i.name === "ex_idx_incl_i",
        )!;
        expect(index.columns).toEqual(["n"]);
        expect(index.include).toEqual(["d"]);
      },
    );

    itIfSupports("index_include", "indexParts emits include before nullsNotDistinct", async () => {
      if ((await adapter.getDatabaseVersion()) < PG_NND_MIN_VERSION) return;
      await adapter.exec(
        `CREATE TABLE "ex_idx_both" ("id" SERIAL PRIMARY KEY, "n" INTEGER, "d" TEXT)`,
      );
      await adapter.exec(
        `CREATE UNIQUE INDEX "ex_idx_both_i" ON "ex_idx_both" ("n") INCLUDE ("d") NULLS NOT DISTINCT`,
      );
      const lines: string[] = [];
      await adapter.createSchemaDumper().dumpTable(lines, "ex_idx_both");
      const indexLine = lines.find((l) => l.includes("ex_idx_both_i"))!;
      expect(indexLine.indexOf("include:")).toBeGreaterThan(-1);
      expect(indexLine.indexOf("include:")).toBeLessThan(indexLine.indexOf("nullsNotDistinct:"));
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
      expect(result![1]!.identifier).toBe("ex_custom_seq");
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
      await adapter.beginTransaction();
      try {
        const pidRows = await adapter.execute(`SELECT pg_backend_pid() AS pid`);
        const pid = (pidRows[0] as { pid: number }).pid;
        const sleepPromise = adapter.execute(`SELECT pg_sleep(10)`);

        sleepPromise.catch(() => {});

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
    // Regression for RFC 0061 pg-query-canceled-unhandled-rejection: rolling
    // back must not fire a CancelRequest at a query some *other* chain put on
    // the wire. Rails gets that from scope alone — `@lock.synchronize` wraps
    // the whole `with_raw_connection` body (abstract_adapter.rb:984) and
    // `rollback_transaction` takes the same lock (abstract/transaction.rb:611),
    // so the rollback simply waits behind the query and finds an idle
    // transaction status, which `cancel_any_running_query`'s
    // IDLE_TRANSACTION_STATUSES gate (postgresql/database_statements.rb:128)
    // returns on.
    it("rollback does not cancel a query issued by another chain", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        await other.beginDbTransaction();
        const foreign = other.execute("SELECT pg_sleep(0.5) AS slept");
        await new Promise<void>((r) => setTimeout(r, 100));
        await other.lock.synchronize(() => other.rollbackDbTransaction());
        await expect(foreign).resolves.toHaveLength(1);
      } finally {
        await other.close();
      }
    });

    // Same for `reset!`, which Rails runs under `@lock` and where it issues
    // ROLLBACK / DISCARD ALL but never a CancelRequest — the two
    // `cancel_any_running_query` callers are exec_rollback/restart
    // (postgresql/database_statements.rb:79, :84), not `reset!`
    // (postgresql_adapter.rb:371-381). The port cancelled here, killing a query
    // another chain owned; with nothing left to observe that rejection it
    // surfaced as vitest's run-end unhandled QueryCanceled.
    it("reset does not cancel a query issued by another chain", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        await other.beginDbTransaction();
        const foreign = other.execute("SELECT pg_sleep(0.5) AS slept");
        await new Promise<void>((r) => setTimeout(r, 100));
        other.resetBang();
        await expect(foreign).resolves.toHaveLength(1);
      } finally {
        await other.close();
      }
    });

    // `resetBang` is sync and cannot block, so it schedules its body onto the
    // connection lock (Rails takes that lock inline, postgresql_adapter.rb:372)
    // and returns. A query already holding the lock must therefore never wait
    // on the queued reset — it would be waiting on work queued behind itself.
    // This is what pins the one-mechanism arrangement: query paths serialize
    // against the reset on the lock alone, never on a second barrier.
    it("a query holding the lock does not wait on a reset queued behind it", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        await other.execute("SELECT 1 AS n");
        setTimeout(() => other.resetBang(), 0);
        await other.lock.synchronize(async () => {
          await new Promise<void>((r) => setTimeout(r, 50));
          const rows = await other.execute("SELECT 1 AS n");
          expect(rows).toHaveLength(1);
        });
      } finally {
        await other.close();
      }
    });

    // Regression for RFC 0061 pg-query-canceled-unhandled-rejection-recurrence:
    // a CancelRequest is addressed to a backend, not to a statement, so firing
    // it without waiting for delivery (`cancel`) and for the cancelled command
    // to come back (`block` — postgresql/database_statements.rb:130-131) lets
    // it land on whatever query is on the wire milliseconds later. Before the
    // fix the sleep below was still running when cancelAnyRunningQuery
    // resolved, and the follow-up SELECT died with "canceling statement due to
    // user request".
    it("cancelAnyRunningQuery does not leak its cancel onto a later query", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        await other.beginDbTransaction();
        let sleepError: unknown;
        const sleep = other.execute("SELECT pg_sleep(2)").catch((e) => {
          sleepError = e;
        });
        await new Promise<void>((r) => setTimeout(r, 200));
        await (
          other as unknown as { _cancelAnyRunningQuery(): Promise<void> }
        )._cancelAnyRunningQuery();
        await sleep;
        expect(sleepError).toBeInstanceOf(QueryCanceled);
        await other.rollbackDbTransaction();
        await expect(other.execute("SELECT 1 AS n")).resolves.toHaveLength(1);
      } finally {
        await other.close();
      }
    });

    // Regression for RFC 0061 pg-cancel-block-half-has-no-regression: nothing
    // covered the `block` half of `cancel_any_running_query`
    // (postgresql/database_statements.rb:131) — deleting the
    // `await this._blockUntilCommandSettles(txClient)` line left the suite
    // green. Its postcondition is libpq's own: once `block` returns, the
    // cancelled command is off the wire, so `PQtransactionStatus` is no longer
    // PQTRANS_ACTIVE. On an unloaded host the backend's ErrorResponse happens to
    // land before the CancelRequest socket closes, so that byte alone does not
    // discriminate; the deferred stand-in below reproduces the "command has not
    // come back yet" state CI's loaded runner produces, and pins that the cancel
    // does not resolve ahead of it.
    it("cancelAnyRunningQuery waits for the cancelled command to come back", async () => {
      const PQTRANS_ACTIVE = 1;
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        await other.beginDbTransaction();
        const sleep = other.execute("SELECT pg_sleep(2)").catch(() => {});
        await new Promise<void>((r) => setTimeout(r, 200));
        expect(other.transactionStatus).toBe(PQTRANS_ACTIVE);

        const internals = other as unknown as {
          _cancelAnyRunningQuery(): Promise<void>;
          _blockUntilCommandSettles(client: unknown): Promise<void>;
        };
        const blockUntilCommandSettles = internals._blockUntilCommandSettles.bind(other);
        let releaseBlock!: () => void;
        const blocked = new Promise<void>((r) => (releaseBlock = r));
        internals._blockUntilCommandSettles = async (client: unknown): Promise<void> => {
          await blocked;
          await blockUntilCommandSettles(client);
        };

        let cancelReturned = false;
        const cancel = internals._cancelAnyRunningQuery().then(() => {
          cancelReturned = true;
        });
        await new Promise<void>((r) => setTimeout(r, 50));
        expect(cancelReturned).toBe(false);
        releaseBlock();
        await cancel;
        expect(other.transactionStatus).not.toBe(PQTRANS_ACTIVE);

        await sleep;
        await other.rollbackDbTransaction();
      } finally {
        await other.close();
      }
    });

    // Rails' `cancel_any_running_query` has nothing to cancel once the lock
    // covers each query's whole life — `rollback_transaction` takes the same
    // lock (abstract/transaction.rb:611) and finds an idle transaction status.
    // The two tests that lived here drove it by abandoning a query inside
    // `synchronize`, the shape RFC 0085 removed; there is no Rails-faithful way
    // to put a query on the wire under a lock this chain holds.

    // Regression for RFC 0061 pg-query-canceled-unhandled-rejection-recurrence:
    // `clear_cache!` mutates the statement pool under `@lock`
    // (abstract_adapter.rb:741-747), which is the precondition `dealloc` states
    // outright — "the statement pool is only accessed while holding the
    // connection's lock" (postgresql_adapter.rb:308-310). The port skipped that
    // lock, so `resetColumnInformation`'s sync, promise-dropping call left
    // eviction DEALLOCATEs on the wire beside a chain that owned the
    // connection; the rollback behind it read PQTRANS_ACTIVE where Rails reads
    // PQTRANS_INTRANS and fired a CancelRequest, which — being addressed to a
    // backend, not a statement — landed on a later query and surfaced as
    // vitest's run-end unhandled QueryCanceled.
    it("clearCacheBang deallocates under the connection lock", async () => {
      const PQTRANS_INTRANS = 2;
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        other.preparedStatements = true;
        await other.execute("SELECT $1::integer AS n", [1]);
        await other.beginDbTransaction();
        // `reset_column_information`'s shape (model_schema.rb:523-524): a sync
        // caller that drops the returned chain.
        void other.clearCacheBang();
        await new Promise<void>((r) => setTimeout(r, 0));
        const status = await other.lock.synchronize(() => other.transactionStatus);
        expect(status).toBe(PQTRANS_INTRANS);
        await other.rollbackDbTransaction();
      } finally {
        await other.close();
      }
    });

    it("translate exception serialization failure", async () => {
      await adapter.exec(`CREATE TABLE "ex_ser" ("id" SERIAL PRIMARY KEY, "val" INTEGER)`);
      await adapter.executeMutation(`INSERT INTO "ex_ser" (val) VALUES (0)`);
      await withSecondAdapter(PG_TEST_URL, async (adapter2) => {
        await adapter.beginIsolatedDbTransaction("serializable");
        await adapter2.beginIsolatedDbTransaction("serializable");
        try {
          await adapter.execute(`SELECT * FROM "ex_ser"`);
          await adapter2.execute(`SELECT * FROM "ex_ser"`);

          await adapter.execute(`UPDATE "ex_ser" SET val = 1`);

          await adapter.commit();

          await adapter2.execute(`UPDATE "ex_ser" SET val = 2`);

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

      expect(JSON.parse(rows[0].val as string)).toEqual(obj);
    });

    it("jsonb decoding", async () => {
      await adapter.exec(`CREATE TABLE "ex_jsonb" ("id" SERIAL PRIMARY KEY, "val" JSONB)`);
      await adapter.executeMutation(`INSERT INTO "ex_jsonb" ("val") VALUES (?)`, [
        JSON.stringify({ b: 2 }),
      ]);

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
      await adapter.exec(`CREATE TABLE "ex_insert_pkfalse" ("id" SERIAL PRIMARY KEY, "n" INT)`);
      await adapter.exec(`SELECT setval(pg_get_serial_sequence('ex_insert_pkfalse', 'id'), 100)`);
      try {
        const result = await adapter.execInsert(
          `INSERT INTO "ex_insert_pkfalse" ("n") VALUES (42)`,
          null,
          [],
          false,
        );

        expect((result as { toArray(): unknown[] }).toArray?.()).toEqual([]);
        const rows = await adapter.execute(`SELECT id, n FROM "ex_insert_pkfalse"`);
        expect(rows[0].id).toBe(101);
        expect(rows[0].n).toBe(42);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS "ex_insert_pkfalse"`);
      }
    });

    let savedWarningsAction: typeof ActiveRecord.dbWarningsAction;
    let savedWarningsIgnore: typeof ActiveRecord.dbWarningsIgnore;
    beforeEach(() => {
      savedWarningsAction = ActiveRecord.dbWarningsAction;
      savedWarningsIgnore = ActiveRecord.dbWarningsIgnore;
    });
    afterEach(() => {
      ActiveRecord.dbWarningsAction = savedWarningsAction ?? "ignore";
      ActiveRecord.dbWarningsIgnore = savedWarningsIgnore;
      vi.restoreAllMocks();
    });
  });

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

      await adapter.loadAdditionalTypes();
      const cols = await adapter.columns("col_reflection_test");
      const mood = cols.find((c) => c.name === "mood")!;
      expect(mood.isEnum).toBe(true);
    });
  });

  describe("DatabaseStatements", () => {
    it("isWriteQuery returns false for read-like statements", () => {
      expect(adapter.isWriteQuery("SELECT 1")).toBe(false);
      expect(adapter.isWriteQuery("SET search_path TO public")).toBe(false);
      expect(adapter.isWriteQuery("SHOW server_version")).toBe(false);
    });

    it("highPrecisionCurrentTimestamp returns CURRENT_TIMESTAMP literal", () => {
      const ts = adapter.highPrecisionCurrentTimestamp();

      expect(ts.toSql({ connection: adapter })).toBe("CURRENT_TIMESTAMP");
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

    // Rails: `transaction_isolation_levels.fetch(isolation)`
    // (postgresql/database_statements.rb:69) raises Ruby's KeyError.
    it("beginIsolatedDbTransaction raises KeyError for an unknown isolation level", async () => {
      await expect(adapter.beginIsolatedDbTransaction("bogus")).rejects.toThrow(
        "key not found: :bogus",
      );
    });
  });

  describe("PostgreSQLAdapter top-level methods", () => {
    it("nativeDatabaseTypes includes expected pg types", () => {
      const types = PostgreSQLAdapter.nativeDatabaseTypes();
      expect(types.string).toEqual({ name: "character varying" });
      expect(types.binary).toEqual({ name: "bytea" });
      expect(types.primary_key).toBe("bigserial primary key");
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
      const len = await adapter.warmMaxIdentifierLength();
      expect(len).toBeGreaterThan(0);
      expect(Number.isInteger(len)).toBe(true);
      expect(adapter.maxIdentifierLength()).toBe(len);
    });

    it("maxIdentifierLength is cached after first call", async () => {
      const first = await adapter.warmMaxIdentifierLength();
      const second = await adapter.warmMaxIdentifierLength();
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

  describe("in-flight acquire adoption race", () => {
    type Deferred = { promise: Promise<pg.Client>; resolve: (c: pg.Client) => void };
    const defer = (): Deferred => {
      let resolve!: (c: pg.Client) => void;
      const promise = new Promise<pg.Client>((r) => (resolve = r));
      return { promise, resolve };
    };

    const waitForNewClientCalls = async (
      spy: { mock: { calls: unknown[] } },
      n: number,
    ): Promise<void> => {
      for (let i = 0; i < 1000 && spy.mock.calls.length < n; i++) await Promise.resolve();
      if (spy.mock.calls.length < n) throw new Error(`newClient not called ${n} time(s)`);
    };

    it("disconnectBang orphans an in-flight acquire so it is not adopted by a racing reconnect", async () => {
      const a = new PostgreSQLAdapter(PG_TEST_URL);
      const orphan = await PostgreSQLAdapter.newClient({ connectionString: PG_TEST_URL });
      const reconnected = await PostgreSQLAdapter.newClient({ connectionString: PG_TEST_URL });
      const endSpy = vi.spyOn(orphan, "end");
      const first = defer();
      const second = defer();
      const spy = vi
        .spyOn(PostgreSQLAdapter, "newClient")
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise);
      try {
        const firstAcquire = a.connect();
        await waitForNewClientCalls(spy, 1);

        a.disconnectBang();

        const reconnect = a.reconnect();
        await waitForNewClientCalls(spy, 2);

        first.resolve(orphan);
        await expect(firstAcquire).rejects.toBeTruthy();

        expect(endSpy).toHaveBeenCalled();
        expect(a._rawConnectionForTest()).toBeNull();

        second.resolve(reconnected);
        await reconnect;
        expect(a._rawConnectionForTest()).toBe(reconnected);
      } finally {
        spy.mockRestore();
        await a.close();
        await orphan.end().catch(() => {});
      }
    });

    it("orphaned acquire still fails when the racing reconnect publishes first", async () => {
      const a = new PostgreSQLAdapter(PG_TEST_URL);
      const orphan = await PostgreSQLAdapter.newClient({ connectionString: PG_TEST_URL });
      const reconnected = await PostgreSQLAdapter.newClient({ connectionString: PG_TEST_URL });
      const endSpy = vi.spyOn(orphan, "end");
      const first = defer();
      const spy = vi
        .spyOn(PostgreSQLAdapter, "newClient")
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => Promise.resolve(reconnected));
      try {
        const firstAcquire = a.connect();
        await waitForNewClientCalls(spy, 1);

        a.disconnectBang();

        await a.reconnect();
        expect(a._rawConnectionForTest()).toBe(reconnected);

        first.resolve(orphan);
        await expect(firstAcquire).rejects.toBeTruthy();

        expect(endSpy).toHaveBeenCalled();
        expect(a._rawConnectionForTest()).toBe(reconnected);
      } finally {
        spy.mockRestore();
        await a.close();
        await orphan.end().catch(() => {});
      }
    });
  });

  describe("lock sharing", () => {
    it("concurrent transaction and bare write do not deadlock", async () => {
      await adapter.exec('DROP TABLE IF EXISTS "abba" CASCADE');
      await adapter.exec('CREATE TABLE "abba" ("id" SERIAL PRIMARY KEY, "n" INT)');
      const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

      const inTx = adapter.transaction(async () => {
        await delay(150);
        await adapter.executeMutation(`INSERT INTO "abba" ("n") VALUES (1)`);
      });

      const bare = (async () => {
        await delay(50);
        await adapter.executeMutation(`INSERT INTO "abba" ("n") VALUES (2)`);
      })();
      await Promise.all([inTx, bare]);
      const rows = await adapter.execute(`SELECT COUNT(*)::int AS c FROM "abba"`);
      expect(rows[0]["c"]).toBe(2);
      await adapter.exec('DROP TABLE IF EXISTS "abba" CASCADE');
    });
  });

  describe("connected?", () => {
    it("connected? is false after the raw connection is finished", async () => {
      await adapter.exec("SELECT 1");
      const rawConnection = (adapter as unknown as { _rawConnection: pg.Client | null })
        ._rawConnection;
      expect(rawConnection).not.toBeNull();
      expect(adapter.isConnected()).toBe(true);

      await rawConnection!.end();

      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe("buildChangeColumnDefinition", () => {
    it("returns a ChangeColumnDefinition with correct column name and sqlType", async () => {
      const def = adapter.buildChangeColumnDefinition("users", "age", "integer");
      expect(def.name).toBe("age");
      expect(def.column.name).toBe("age");

      expect(await adapter.schemaCreation.accept(def)).toContain("TYPE integer");
    });

    it("reflects using/castAs options on the column definition", () => {
      const def = adapter.buildChangeColumnDefinition("users", "score", "decimal", {
        using: "score::decimal",
      });
      expect(def.column.options).toMatchObject({ using: "score::decimal" });
    });
  });

  describe("buildChangeColumnDefaultDefinition", () => {
    beforeEach(async () => {
      await adapter.exec(`
        CREATE TABLE "bcd_test" (
          "id" SERIAL PRIMARY KEY,
          "score" INTEGER DEFAULT 0,
          "created_at" TIMESTAMP WITHOUT TIME ZONE,
          "tags" TEXT[],
          "price" NUMERIC(5,2)
        )
      `);
    });

    afterEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS "bcd_test" CASCADE`);
    });

    it("returns a ChangeColumnDefaultDefinition with the new default value and correct types", async () => {
      const def = await adapter.buildChangeColumnDefaultDefinition("bcd_test", "score", 42);
      expect(def).toBeDefined();
      expect(def!.column.name).toBe("score");
      expect(def!.default).toBe(42);
      expect(def!.column.type).toBe("integer");
      expect(def!.column.sqlType).toBe("integer");
    });

    it("preserves semantic type and raw sqlType for timestamp column", async () => {
      const def = await adapter.buildChangeColumnDefaultDefinition(
        "bcd_test",
        "created_at",
        "NOW()",
      );
      expect(def).toBeDefined();
      expect(def!.column.name).toBe("created_at");
      expect(def!.column.type).toBe("datetime");
      expect(def!.column.sqlType).toMatch(/timestamp/i);
    });

    it("preserves array column type", async () => {
      const def = await adapter.buildChangeColumnDefaultDefinition("bcd_test", "tags", "{}");
      expect(def).toBeDefined();
      expect(def!.column.name).toBe("tags");
      expect((def!.column as PgColumn).array).toBe(true);
      expect(def!.column.sqlType).toMatch(/text/i);
    });

    it("carries the live reflected Column with oid and fmod", async () => {
      const def = await adapter.buildChangeColumnDefaultDefinition("bcd_test", "score", 42);
      const col = def!.column as PgColumn;
      expect(col).toBeInstanceOf(PgColumn);
      expect(col.oid).toBe(23);
      expect(col.fmod).not.toBeNull();
    });

    it("resolves fmod-dependent types (numeric precision/scale) through the carried column", async () => {
      const def = await adapter.buildChangeColumnDefaultDefinition("bcd_test", "price", "12.345");
      const col = def!.column as PgColumn;
      expect(col.fmod).not.toBeNull();
      expect(col.precision).toBe(5);
      expect(col.scale).toBe(2);
      const sql = await adapter.schemaCreation.accept(def!);
      expect(sql).toBe(`ALTER COLUMN "price" SET DEFAULT 12.35`);
    });

    it("quotes the default via the OID key without a regtype SCHEMA query", async () => {
      const def = await adapter.buildChangeColumnDefaultDefinition("bcd_test", "score", 42);
      const spy = vi.spyOn(
        adapter as unknown as { internalExecQuery(sql: string): Promise<unknown> },
        "internalExecQuery",
      );
      try {
        const sql = await adapter.schemaCreation.accept(def!);
        expect(sql).toContain("SET DEFAULT 42");
        const regtypeQueries = spy.mock.calls.filter(([q]) => /regtype/.test(String(q)));
        expect(regtypeQueries).toEqual([]);
      } finally {
        spy.mockRestore();
      }
    });

    it("extracts :to from a {from:, to:} change hash", async () => {
      const def = await adapter.buildChangeColumnDefaultDefinition("bcd_test", "score", {
        from: 0,
        to: 99,
      });
      expect(def!.default).toBe(99);
    });

    it("returns undefined when column does not exist", async () => {
      const def = await adapter.buildChangeColumnDefaultDefinition("bcd_test", "nonexistent", 42);
      expect(def).toBeUndefined();
    });
  });

  describe("addColumn datetime precision", () => {
    beforeEach(async () => {
      await adapter.exec('DROP TABLE IF EXISTS "dt_prec_test" CASCADE');
      await adapter.exec(`CREATE TABLE "dt_prec_test" ("id" SERIAL PRIMARY KEY)`);
    });

    afterEach(async () => {
      await adapter.exec('DROP TABLE IF EXISTS "dt_prec_test" CASCADE');
    });

    async function columnSqlType(colName: string): Promise<string> {
      const rows = (
        await (adapter as any).internalExecQuery(
          `SELECT pg_catalog.format_type(a.atttypid, a.atttypmod) AS sql_type
         FROM pg_attribute a
         JOIN pg_class t ON t.oid = a.attrelid
         WHERE t.relname = 'dt_prec_test' AND a.attname = $1 AND a.attnum > 0`,
          "SCHEMA",
          [colName],
        )
      ).toArray();
      return rows[0]?.sql_type as string;
    }

    it("addColumn datetime defaults to TIMESTAMP(6)", async () => {
      await adapter.addColumn("dt_prec_test", "happened_at", "datetime");
      expect(await columnSqlType("happened_at")).toBe("timestamp(6) without time zone");
    });

    it("addColumn datetime respects explicit precision", async () => {
      await adapter.addColumn("dt_prec_test", "happened_at", "datetime", { precision: 0 });
      expect(await columnSqlType("happened_at")).toBe("timestamp(0) without time zone");
    });

    it("addColumn datetime null precision omits precision suffix", async () => {
      await adapter.addColumn("dt_prec_test", "happened_at", "datetime", { precision: null });
      expect(await columnSqlType("happened_at")).toBe("timestamp without time zone");
    });
  });

  describe("createDatabase option string", () => {
    it("emits the remaining option arms in merged-hash order", async () => {
      const sqls = await captureSql(
        () =>
          adapter.createDatabase("db", {
            owner: "alice",
            template: "template0",
            tablespace: "fast",
            connectionLimit: -1,
          }),
        { stub: adapter },
      );
      expect(sqls[0]).toBe(
        `CREATE DATABASE "db" ENCODING = 'utf8' OWNER = "alice" TEMPLATE = "template0"` +
          ` TABLESPACE = "fast" CONNECTION LIMIT = -1`,
      );
    });

    it("ignores keys it has no arm for instead of rejecting them", async () => {
      const sqls = await captureSql(
        () => adapter.createDatabase("db", { adapter: "postgresql", host: "localhost" }),
        { stub: adapter },
      );
      expect(sqls[0]).toBe(`CREATE DATABASE "db" ENCODING = 'utf8'`);
    });
  });
});

describe("PostgreSQLAdapter#_columnMethodNames", () => {
  it("appends PG ColumnMethods shorthands to the abstract list", () => {
    const adapter = Object.create(PostgreSQLAdapter.prototype) as PostgreSQLAdapter;
    const names = adapter._columnMethodNames();
    for (const name of [
      "serial",
      "bigserial",
      "bitVarying",
      "int4range",
      "int8range",
      "jsonb",
      "uuid",
      "hstore",
      "citext",
      "timestamptz",
      "enum",
    ]) {
      expect(names).toContain(name);
    }

    expect(names).toContain("virtual");
    expect(names).not.toContain("primary_key");
  });
});

describe("PostgreSQLAdapter supports_* predicates (unit)", () => {
  function makeAdapter(): PostgreSQLAdapter {
    const adapter = new PostgreSQLAdapter({ host: "stub", port: 0 });
    return adapter;
  }

  function stubVersion(adapter: PostgreSQLAdapter, version: number): void {
    (adapter as any)._initialized = true;
    (adapter as any)._hasPgHintPlan = false;
    // `database_version` reads the pool memo (`abstract_adapter.rb:854-856`),
    // which is the only place the version is cached, so the stub is staged
    // there.
    (adapter.pool as unknown as { _serverVersion: unknown })._serverVersion = version;
  }

  it("always-true predicates return true regardless of version", async () => {
    const adapter = makeAdapter();
    stubVersion(adapter, 90300);
    expect(adapter.supportsBulkAlter()).toBe(true);
    expect(await adapter.supportsIndexSortOrder()).toBe(true);
    expect(adapter.supportsPartialIndex()).toBe(true);
    expect(await adapter.supportsExpressionIndex()).toBe(true);
    expect(adapter.supportsTransactionIsolation()).toBe(true);
    expect(adapter.supportsForeignKeys()).toBe(true);
    expect(await adapter.supportsCheckConstraints()).toBe(true);
    expect(adapter.supportsViews()).toBe(true);
    expect(await adapter.supportsJson()).toBe(true);
    expect(adapter.supportsComments()).toBe(true);
    expect(adapter.supportsSavepoints()).toBe(true);
    expect(await adapter.supportsInsertReturning()).toBe(true);
    expect(adapter.supportsDdlTransactions()).toBe(true);
    expect(adapter.supportsAdvisoryLocks()).toBe(true);
    expect(adapter.supportsExplain()).toBe(true);
    expect(adapter.supportsExtensions()).toBe(true);
    expect(adapter.supportsMaterializedViews()).toBe(true);
    expect(adapter.supportsForeignTables()).toBe(true);
    expect(await adapter.supportsCommonTableExpressions()).toBe(true);
    expect(adapter.supportsLazyTransactions()).toBe(true);
  });

  it("version-gated predicates respect version thresholds", async () => {
    const adapter = makeAdapter();

    stubVersion(adapter, 90300);
    expect(await adapter.supportsInsertOnConflict()).toBe(false);
    expect(await adapter.supportsPgcryptoUuid()).toBe(false);
    expect(await adapter.supportsIdentityColumns()).toBe(false);
    expect(await adapter.supportsPartitionedIndexes()).toBe(false);
    expect(await adapter.supportsVirtualColumns()).toBe(false);
    expect(await adapter.supportsRestartDbTransaction()).toBe(false);
    expect(await adapter.supportsNullsNotDistinct()).toBe(false);

    stubVersion(adapter, 90500);
    expect(await adapter.supportsInsertOnConflict()).toBe(true);
    expect(await adapter.supportsInsertOnDuplicateSkip()).toBe(true);
    expect(await adapter.supportsInsertOnDuplicateUpdate()).toBe(true);
    expect(await adapter.supportsInsertConflictTarget()).toBe(true);
    expect(await adapter.supportsPgcryptoUuid()).toBe(true);

    stubVersion(adapter, 100000);
    expect(await adapter.supportsIdentityColumns()).toBe(true);
    expect(await adapter.supportsNativePartitioning()).toBe(true);

    stubVersion(adapter, 110000);
    expect(await adapter.supportsPartitionedIndexes()).toBe(true);
    expect(await adapter.supportsIndexInclude()).toBe(true);

    stubVersion(adapter, 120000);
    expect(await adapter.supportsVirtualColumns()).toBe(true);
    expect(await adapter.supportsRestartDbTransaction()).toBe(true);

    stubVersion(adapter, 150000);
    expect(await adapter.supportsNullsNotDistinct()).toBe(true);
  });

  it("indexAlgorithms returns concurrently", async () => {
    const adapter = makeAdapter();
    expect(adapter.indexAlgorithms()).toEqual({ concurrently: "CONCURRENTLY" });
  });

  it("typeToSql emits TIMESTAMP(n) with explicit precision", async () => {
    const adapter = makeAdapter();
    expect(adapter.typeToSql("datetime", { precision: 6 })).toBe("timestamp(6)");
    expect(adapter.typeToSql("datetime", { precision: 0 })).toBe("timestamp(0)");
    expect(adapter.typeToSql("datetime", { precision: 3 })).toBe("timestamp(3)");

    expect(adapter.typeToSql("datetime")).toBe("timestamp");
  });
});

// Rails has no test for the `is_a?(Integer) && bit_length <= 63` guard in
// postgresql_adapter.rb:459-471, so these are trails-only covers for it.
describe("PostgreSQLAdapter advisory lock id guard (unit)", () => {
  const message = "PostgreSQL requires advisory lock ids to be a signed 64 bit integer";

  function makeAdapter(): PostgreSQLAdapter {
    return new PostgreSQLAdapter({ host: "stub", port: 0 });
  }

  it("getAdvisoryLock raises ArgumentError for a string lock id", async () => {
    const adapter = makeAdapter();
    await expect(adapter.getAdvisoryLock("some-lock-name")).rejects.toThrow(message);
  });

  it("releaseAdvisoryLock raises ArgumentError for a string lock id", async () => {
    const adapter = makeAdapter();
    await expect(adapter.releaseAdvisoryLock("some-lock-name")).rejects.toThrow(message);
  });

  it("raises ArgumentError for a fractional lock id", async () => {
    const adapter = makeAdapter();
    await expect(adapter.getAdvisoryLock(1.5)).rejects.toThrow(message);
  });

  it("raises ArgumentError for a lock id wider than 63 bits", async () => {
    const adapter = makeAdapter();
    await expect(adapter.getAdvisoryLock(2n ** 63n)).rejects.toThrow(message);
    await expect(adapter.getAdvisoryLock(-(2n ** 63n) - 1n)).rejects.toThrow(message);
  });

  it("accepts the signed 64 bit boundaries and interpolates them into the SQL", async () => {
    const adapter = makeAdapter();
    const queryValue = vi.spyOn(adapter, "queryValue").mockResolvedValue(true);

    expect(await adapter.getAdvisoryLock(2n ** 63n - 1n)).toBe(true);
    expect(await adapter.releaseAdvisoryLock(-(2n ** 63n))).toBe(true);

    expect(queryValue.mock.calls.map((c) => c[0])).toEqual([
      "SELECT pg_try_advisory_lock(9223372036854775807)",
      "SELECT pg_advisory_unlock(-9223372036854775808)",
    ]);
  });
});

// trails-only: Rails' PostgreSQLAdapter#active? (postgresql_adapter.rb:347-356)
// is a live probe — `@raw_connection.query ";"` then `verified!`, rescuing
// PG::Error to false. Rails has no test that isolates the probe from the handle
// guard, so this covers the half the guard alone cannot answer: a connected
// client whose backend is gone still reports connected? true but active? false.
describeIfPg("PostgreSQLAdapter#active", () => {
  it("returns false once the backend behind a live client is terminated", async () => {
    const adapter = new PostgreSQLAdapter(PG_TEST_URL);
    try {
      const pidRows = await adapter.execute("SELECT pg_backend_pid() AS pid");
      const pid = (pidRows[0] as { pid: number }).pid;
      expect(await adapter.active()).toBe(true);

      await withSecondAdapter(PG_TEST_URL, async (adapter2) => {
        await adapter2.execute(`SELECT pg_terminate_backend(${pid})`);
      });

      expect(await adapter.active()).toBe(false);
    } finally {
      await adapter.close();
    }
  });
  // Regression: `internalExecQuery -> castResult -> getOidType ->
  // loadAdditionalTypes -> internalExecQuery` was a cycle. Rails cannot reach it
  // because `load_additional_types` runs the pg_type query through the UNCAST
  // `internal_execute` (postgresql_adapter.rb:870), which never consults the
  // type map — so `get_oid_type` is a two-line body with no reentrancy branch.
  // Pre-fix trails ran it through the cast read path and recursed until timeout.
  it("loadAdditionalTypes runs uncast, so it cannot re-enter getOidType", async () => {
    const adapter = new PostgreSQLAdapter(PG_TEST_URL);
    try {
      await adapter.execute("SELECT 1");
      const internals = adapter as unknown as {
        typeMap: { has(oid: number): boolean };
      };
      const getOidTypeSpy = vi.spyOn(adapter, "getOidType");
      const rows = await adapter.execute("SELECT 'regprocedure'::regtype::oid AS oid");
      const oid = Number((rows[0] as { oid: number | string }).oid);
      getOidTypeSpy.mockClear();

      await adapter.loadAdditionalTypes([oid]);

      expect(getOidTypeSpy).not.toHaveBeenCalled();
      expect(internals.typeMap.has(987654321)).toBe(false);
    } finally {
      await adapter.close();
    }
  });
});
