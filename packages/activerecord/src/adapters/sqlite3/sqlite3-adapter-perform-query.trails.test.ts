/**
 * trails-only coverage for the unified `perform_query` primitive.
 *
 * Rails' SQLite3 adapter has one SQL primitive, perform_query, which branches on
 * `stmt.column_count.zero?` and sources affected rows from a separate
 * `raw_connection.changes` read. These assert the branch and that read hold for
 * the better-sqlite3 analogue (`stmt.reader` / `SELECT changes()`), including
 * the case where a statement both returns rows and writes
 * (`INSERT ... RETURNING`).
 */
import { it, expect, beforeEach, afterEach } from "vitest";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { Base } from "../../base.js";
import { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../../connection-adapters/better-sqlite3-adapter.js";
import { ReadOnlyError } from "../../errors.js";
import { acquireStatementLock } from "../../connection-adapters/sqlite3/database-statements.js";

let adapter: SQLite3Adapter;

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
    // `column_count.zero?` branch that lets DDL flow through `execute`.
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

  it("affectedRows is preserved across DDL", async () => {
    await adapter.executeMutation(`INSERT INTO "pq" ("nick") VALUES ('a')`);
    await adapter.executeMutation(`INSERT INTO "pq" ("nick") VALUES ('b')`);
    expect(await adapter.executeMutation(`UPDATE "pq" SET "nick" = 'z'`)).toBe(2);

    // sqlite3_changes() is advanced only by DML, so the DDL below leaves the
    // UPDATE's count standing where a RunResult would report 0.
    await adapter.execute(`CREATE TABLE "pq_ddl" ("id" INTEGER)`);
    expect(adapter.affectedRows()).toBe(2);
  });

  it("execute returns the rows an INSERT ... RETURNING produces", async () => {
    // `stmt.column_count.zero?` alone — no write predicate — so a RETURNING
    // write comes back as rows with row_count = 1.
    await expect(
      adapter.execute(`INSERT INTO "pq" ("nick") VALUES ('a') RETURNING "id", "nick"`),
    ).resolves.toEqual([{ id: 1, nick: "a" }]);
    expect(adapter.affectedRows()).toBe(1);
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
    // A RETURNING write takes the `.all()` branch (nonzero column count), so
    // the id comes from `last_insert_rowid()` read under the statement lock —
    // atomically with the insert.
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
    // The statement and its `last_insert_rowid()` readback are serialized by
    // the FIFO statement lock — so inserts issued concurrently (interleaving
    // at await points) each get their own id. The id is returned from
    // performQuery as a local rather than re-read from the shared
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

  it("serializes statements queued on one connection", async () => {
    // The statement and its `changes()` / `last_insert_rowid()` readbacks are
    // one critical section, so no second caller may be inside while another
    // holds it — and arrival order is service order.
    const host: { _statementLock: Promise<void> | null } = { _statementLock: null };
    let inside = 0;
    let arrivals = 0;
    const served: number[] = [];

    await Promise.all(
      Array.from({ length: 25 }, async (_unused, i) => {
        for (let stagger = 0; stagger < i % 4; stagger++) await Promise.resolve();
        // The queue tail is published synchronously on entry, so the number
        // taken here is this caller's place in it.
        const arrival = arrivals++;
        const release = await acquireStatementLock(host);
        inside += 1;
        expect(inside).toBe(1);
        served.push(arrival);
        await new Promise((resolve) => setTimeout(resolve, 0));
        inside -= 1;
        release();
      }),
    );

    expect(served).toEqual(Array.from({ length: 25 }, (_unused, i) => i));
  });

  it("does not let a late statement barge ahead of one already queued", async () => {
    // The release window is where a check-then-set lock loses its queue: the
    // waiter is still parked in the microtask queue when a caller arriving in
    // the same synchronous turn observes a free lock and claims it first.
    const host: { _statementLock: Promise<void> | null } = { _statementLock: null };
    const served: string[] = [];

    const held = await acquireStatementLock(host);
    const queued = (async () => {
      const release = await acquireStatementLock(host);
      served.push("queued");
      release();
    })();
    await Promise.resolve();

    held();
    const late = (async () => {
      const release = await acquireStatementLock(host);
      served.push("late");
      release();
    })();

    await Promise.all([queued, late]);
    expect(served).toEqual(["queued", "late"]);
  });

  it("does not close the handle out from under a statement holding the lock", async () => {
    // Rails' disconnect! (sqlite3_adapter.rb:221) runs under the same @lock
    // with_raw_connection holds around perform_query
    // (abstract/database_statements.rb:552-559), so a pool teardown can never
    // land between a statement's preparation and its execution.
    const closing = new BetterSQLite3Adapter(":memory:");
    // Private :memory: handle, closed by the disconnect this test provokes —
    // nothing outlives the test to collide with a sibling fork.
    // eslint-disable-next-line blazetrails/require-table-teardown
    await closing.exec(`CREATE TABLE "dc" ("id" INTEGER PRIMARY KEY)`);
    const release = await acquireStatementLock(closing);
    const held = closing._statementLock;

    const queued = closing.executeMutation(`INSERT INTO "dc" DEFAULT VALUES`);
    // Yield until the statement has joined the lock queue, so the disconnect
    // below is provoked at exactly the moment Rails' @lock covers.
    for (let i = 0; i < 100 && closing._statementLock === held; i++) await Promise.resolve();
    expect(closing._statementLock).not.toBe(held);

    closing.disconnectBang();
    expect(closing.isOpen).toBe(true);

    release();
    await expect(queued).resolves.toBe(1);

    await closing.whenClosed();
    expect(closing.isOpen).toBe(false);
  });

  it("reports itself inactive once the disconnect a caller awaited has returned", async () => {
    // Ruby's `@lock.synchronize` blocks (abstract_adapter.rb:696-701), so
    // `active?` is already false the moment `disconnect!` returns. JS cannot
    // block, so the close lands on `_statementLock`'s tail — and `active()`,
    // the awaitable surface, drains it rather than reporting the open handle
    // Rails never exposes.
    const closing = new BetterSQLite3Adapter(":memory:");
    // eslint-disable-next-line blazetrails/require-table-teardown
    await closing.exec(`CREATE TABLE "dc2" ("id" INTEGER PRIMARY KEY)`);
    const release = await acquireStatementLock(closing);
    const held = closing._statementLock;

    const queued = closing.executeMutation(`INSERT INTO "dc2" DEFAULT VALUES`);
    for (let i = 0; i < 100 && closing._statementLock === held; i++) await Promise.resolve();

    closing.disconnectBang();
    // Asked WHILE the close is still queued behind the statement — the window
    // Rails does not have. It must not answer until the handle is closed.
    const answered = closing.active();

    release();
    await expect(queued).resolves.toBe(1);

    expect(await answered).toBe(false);
    expect(closing.isOpen).toBe(false);
  });

  it("returns the rowid of each of two RETURNING inserts issued together", async () => {
    const ids = await Promise.all([
      adapter.executeMutation(`INSERT INTO "pq" ("nick") VALUES ('a') RETURNING "id"`),
      adapter.executeMutation(`INSERT INTO "pq" ("nick") VALUES ('b') RETURNING "id"`),
    ]);
    expect([...ids].sort((a, b) => a - b)).toEqual([1, 2]);
  });

  // Rails' `preventing_writes?` returns false when `connection_descriptor` is nil
  // (abstract_adapter.rb:229), so a `Base` scope only reaches a pool-backed
  // connection — these two lease rather than reuse the standalone adapter above.
  // The guard itself lives in preprocess_query's check_if_write_query, so it
  // covers execute and executeMutation alike.
  it("errors when a write is routed through execute while preventing writes", async () => {
    const connection = (await Base.leaseConnection()) as unknown as SQLite3Adapter;
    await expect(
      Base.whilePreventingWrites(() =>
        connection.execute(`INSERT INTO subscribers(nick) VALUES ('pq')`),
      ),
    ).rejects.toThrow(ReadOnlyError);
  });

  it("does not prevent a read routed through execute while preventing writes", async () => {
    const connection = (await Base.leaseConnection()) as unknown as SQLite3Adapter;
    await Base.whilePreventingWrites(async () => {
      await expect(
        connection.execute(`SELECT * FROM subscribers WHERE nick = 'pq'`),
      ).resolves.toEqual([]);
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
  // Rails' internal_execute forwards `prepare:` to raw_execute → perform_query,
  // whose prepare branch pools the statement (`@statements[sql] ||=
  // raw_connection.prepare(sql)`, sqlite3/database_statements.rb:81-91). The
  // unprepared arm stays on `exec`, which never touches the pool.
  it("internalExecute prepares when prepare is true", async () => {
    const pool = (adapter as unknown as { _statementPool: { get(sql: string): unknown } })
      ._statementPool;
    await adapter.internalExecute(`SELECT 1`, "SQL", { prepare: true });
    expect(pool.get(`SELECT 1`)).toBeTruthy();
  });

  it("internalExecute does not prepare when prepare is false", async () => {
    const pool = (adapter as unknown as { _statementPool: { get(sql: string): unknown } })
      ._statementPool;
    await adapter.internalExecute(`SELECT 2`, "SQL", { prepare: false });
    expect(pool.get(`SELECT 2`)).toBeFalsy();
  });
  it("internalExecute binds through to the driver", async () => {
    await adapter.internalExecute(`INSERT INTO "pq" ("id", "nick") VALUES (?, ?)`, "SQL", {
      binds: [7, "bound"],
    });
    expect(await adapter.queryValue(`SELECT "nick" FROM "pq" WHERE "id" = 7`)).toBe("bound");
  });

  it("internalExecute binds through to the driver when prepare is true", async () => {
    await adapter.internalExecute(`INSERT INTO "pq" ("id", "nick") VALUES (?, ?)`, "SQL", {
      binds: [8, "prepared"],
      prepare: true,
    });
    expect(await adapter.queryValue(`SELECT "nick" FROM "pq" WHERE "id" = 8`)).toBe("prepared");
  });

  // Rails' perform_query takes `raw_connection.execute_batch2(sql)` when
  // `batch: true` (sqlite3/database_statements.rb:79-80) — the only arm that
  // accepts more than one statement, since `prepare` is single-statement. Only
  // `raw_execute` carries the keyword (abstract/database_statements.rb:552);
  // `internal_execute` has no `batch:` and so always prepares.
  it("rawExecute runs multi-statement SQL through the batch arm", async () => {
    await adapter.rawExecute(
      `INSERT INTO "pq" ("nick") VALUES ('one');\nINSERT INTO "pq" ("nick") VALUES ('two')`,
      "SQL",
      [],
      false,
      false,
      false,
      true,
      true,
    );
    expect(await adapter.queryValue(`SELECT COUNT(*) FROM "pq"`)).toBe(2);
  });

  it("internalExecute rejects multi-statement SQL, having no batch arm", async () => {
    await expect(adapter.internalExecute(`SELECT 1;\nSELECT 2`, "SQL")).rejects.toThrow();
  });

  it("executeBatch combines the statements and runs them through the batch arm", async () => {
    await adapter.executeBatch([
      `INSERT INTO "pq" ("nick") VALUES ('a')`,
      `INSERT INTO "pq" ("nick") VALUES ('b')`,
      `INSERT INTO "pq" ("nick") VALUES ('c')`,
    ]);
    expect(await adapter.queryValue(`SELECT COUNT(*) FROM "pq"`)).toBe(3);
  });
});
