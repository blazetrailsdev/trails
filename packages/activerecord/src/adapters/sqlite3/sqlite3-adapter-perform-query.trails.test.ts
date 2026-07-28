/**
 * trails-only coverage for the unified `perform_query` primitive.
 *
 * Rails' SQLite3 adapter has one SQL primitive, perform_query, which branches on
 * `stmt.column_count.zero?` and sources affected rows from a separate
 * `raw_connection.changes` read. These assert the branch and that read hold for
 * the better-sqlite3 analogue (`stmt.reader` / `RunResult`), including the case
 * where a statement both returns rows and writes (`INSERT ... RETURNING`).
 */
import { it, expect, beforeEach, afterEach } from "vitest";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { AbstractSQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../../connection-adapters/better-sqlite3-adapter.js";
import { ReadOnlyError } from "../../errors.js";

let adapter: AbstractSQLite3Adapter;

beforeEach(async () => {
  adapter = new BetterSQLite3Adapter(":memory:");
  await adapter.exec(`CREATE TABLE "pq" ("id" INTEGER PRIMARY KEY, "nick" TEXT)`);
});

afterEach(async () => {
  await adapter
    .exec(`DROP TABLE IF EXISTS "pq"; DROP TABLE IF EXISTS "pq_ddl"`)
    .catch(() => undefined);
  await adapter.close();
});

describeIfSqlite("SQLite3AdapterPerformQueryTest (trails)", () => {
  it("execute runs a non-row-returning statement and returns no rows", async () => {
    // `.all()` throws on a statement with no result columns, so this is the
    // branch that lets DDL flow through the public `execute`.
    await expect(adapter.execute(`CREATE TABLE "pq_ddl" ("id" INTEGER)`)).resolves.toEqual([]);
    await expect(adapter.execute(`INSERT INTO "pq" ("nick") VALUES ('a')`)).resolves.toEqual([]);
  });

  it("execute still returns rows for a row-returning statement", async () => {
    await adapter.executeMutation(`INSERT INTO "pq" ("nick") VALUES ('a')`);
    await expect(adapter.execute(`SELECT "nick" FROM "pq"`)).resolves.toEqual([{ nick: "a" }]);
  });

  it("affectedRows reports the rows changed by the last write", async () => {
    await adapter.executeMutation(`INSERT INTO "pq" ("nick") VALUES ('a')`);
    await adapter.executeMutation(`INSERT INTO "pq" ("nick") VALUES ('b')`);

    expect(await adapter.executeMutation(`UPDATE "pq" SET "nick" = 'z'`)).toBe(2);
    expect(adapter.affectedRows()).toBe(2);

    // A read leaves the count alone — it tracks the last write, as
    // raw_connection.changes does in Rails.
    await adapter.execute(`SELECT * FROM "pq"`);
    expect(adapter.affectedRows()).toBe(2);
  });

  it("affectedRows is not reset by transaction control in the run branch", async () => {
    await adapter.executeMutation(`INSERT INTO "pq" ("nick") VALUES ('a')`);
    await adapter.executeMutation(`INSERT INTO "pq" ("nick") VALUES ('b')`);
    await adapter.executeMutation(`BEGIN`);
    expect(await adapter.executeMutation(`UPDATE "pq" SET "nick" = 'z'`)).toBe(2);
    // BEGIN/COMMIT take the run branch but are not writes, so they don't touch
    // the count — the last write's value survives them.
    await adapter.executeMutation(`COMMIT`);
    expect(adapter.affectedRows()).toBe(2);
  });

  it("executeMutation returns the inserted id for INSERT ... RETURNING", async () => {
    // A write takes the `.run()` branch even with RETURNING, so the id comes
    // from the RunResult's lastInsertRowid, atomically with the insert.
    const id = await adapter.executeMutation(
      `INSERT INTO "pq" ("nick") VALUES ('a') RETURNING "id"`,
    );
    expect(id).toBe(1);

    const second = await adapter.executeMutation(
      `INSERT INTO "pq" ("nick") VALUES ('b') RETURNING "id"`,
    );
    expect(second).toBe(2);
    expect(adapter.affectedRows()).toBe(1);
  });

  it("returns distinct insert ids for concurrent inserts", async () => {
    // The count/rowid come from the RunResult, not a follow-up
    // `last_insert_rowid()` read — so inserts issued concurrently (interleaving
    // at await points) each get their own id. The id is returned from
    // _performQuery as a local rather than re-read from the shared
    // this._lastInsertRowid, which a concurrent insert would overwrite before
    // the post-await continuation reads it. NOTE: a race is timing-dependent —
    // bare inserts interleave too little to reproduce it reliably here (the
    // regression that motivated this reached CI through model `.create`, whose
    // callbacks add denser interleaving; HasManyThroughAssociationsTest "should
    // respect table alias" is the reliable guard). This is a smoke test of the
    // happy path.
    const n = 25;
    const ids = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        adapter.executeMutation(`INSERT INTO "pq" ("nick") VALUES ('n${i}')`),
      ),
    );
    expect(new Set(ids).size).toBe(n);
    expect([...ids].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
  });

  it("errors when a write is routed through execute while preventing writes", async () => {
    // The guard lives in preprocess_query's check_if_write_query, so it covers
    // execute and executeMutation alike.
    await expect(
      adapter.withPreventedWrites(() => adapter.execute(`INSERT INTO "pq" ("nick") VALUES ('a')`)),
    ).rejects.toThrow(ReadOnlyError);
  });

  it("does not prevent a read routed through execute while preventing writes", async () => {
    await adapter.withPreventedWrites(async () => {
      await expect(adapter.execute(`SELECT * FROM "pq"`)).resolves.toEqual([]);
    });
  });

  it("dirties the current transaction for a write routed through execute", async () => {
    // Dirtying hangs off the primitive rather than executeMutation, so a write
    // reaching the connection through execute marks the transaction too.
    await adapter.transaction(async () => {
      await adapter.execute(`INSERT INTO "pq" ("nick") VALUES ('a')`);
      expect(adapter.currentTransaction().isDirty()).toBe(true);
    });
  });

  it("dirties the current transaction for a read too", async () => {
    // Rails dirties in with_raw_connection's ensure gated on
    // materialize_transactions, NOT on write — so a plain SELECT in an open
    // transaction dirties it just like a write does.
    await adapter.transaction(async () => {
      await adapter.execute(`SELECT * FROM "pq"`);
      expect(adapter.currentTransaction().isDirty()).toBe(true);
    });
  });

  it("dirties the current transaction even when the statement raises", async () => {
    // The dirty runs in the primitive's finally, mirroring Rails' ensure — a
    // failed write still leaves the transaction dirty.
    await adapter.transaction(async () => {
      await expect(
        adapter.execute(`INSERT INTO "no_such_table" ("x") VALUES (1)`),
      ).rejects.toThrow();
      expect(adapter.currentTransaction().isDirty()).toBe(true);
    });
  });
});
