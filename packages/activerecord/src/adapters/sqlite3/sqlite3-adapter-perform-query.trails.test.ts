import { it, expect, beforeEach, afterEach } from "vitest";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { Base } from "../../base.js";
import { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../../connection-adapters/better-sqlite3-adapter.js";
import { ReadOnlyError } from "../../errors.js";
import { Result } from "../../result.js";
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
    await expect(adapter.execute(`CREATE TABLE "pq_ddl" ("id" INTEGER)`)).resolves.toEqual([]);
    await expect(adapter.execute(`INSERT INTO "pq" ("nick") VALUES ('a')`)).resolves.toEqual([]);
  });

  it("execute still returns rows for a row-returning statement", async () => {
    await adapter.executeMutation(`INSERT INTO "pq" ("nick") VALUES ('a')`);
    await expect(adapter.execute(`SELECT "nick" FROM "pq"`)).resolves.toEqual([{ nick: "a" }]);
  });

  it("rawExecute returns an ActiveRecord::Result carrying the statement's columns", async () => {
    const empty = (await adapter.rawExecute(`SELECT "id", "nick" FROM "pq"`, "SQL")) as Result;
    expect(empty).toBeInstanceOf(Result);
    expect(empty.columns).toEqual(["id", "nick"]);
    expect(empty.rows).toEqual([]);

    const written = (await adapter.rawExecute(
      `INSERT INTO "pq" ("nick") VALUES ('a')`,
      "SQL",
    )) as Result;
    expect(written.columns).toEqual([]);
    expect(written.rows).toEqual([]);

    const loaded = (await adapter.rawExecute(`SELECT "nick" FROM "pq"`, "SQL")) as Result;
    expect(loaded.toArray()).toEqual([{ nick: "a" }]);
  });

  it("affectedRows reports the rows changed by the last write", async () => {
    await adapter.executeMutation(`INSERT INTO "pq" ("nick") VALUES ('a')`);
    await adapter.executeMutation(`INSERT INTO "pq" ("nick") VALUES ('b')`);

    expect(await adapter.executeMutation(`UPDATE "pq" SET "nick" = 'z'`)).toBe(2);
    expect(adapter.affectedRows()).toBe(2);

    await adapter.execute(`SELECT * FROM "pq"`);
    expect(adapter.affectedRows()).toBe(2);
  });

  it("affectedRows is preserved across DDL", async () => {
    await adapter.executeMutation(`INSERT INTO "pq" ("nick") VALUES ('a')`);
    await adapter.executeMutation(`INSERT INTO "pq" ("nick") VALUES ('b')`);
    expect(await adapter.executeMutation(`UPDATE "pq" SET "nick" = 'z'`)).toBe(2);

    await adapter.execute(`CREATE TABLE "pq_ddl" ("id" INTEGER)`);
    expect(adapter.affectedRows()).toBe(2);
  });

  it("execute returns the rows an INSERT ... RETURNING produces", async () => {
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
    await adapter.executeMutation(`COMMIT`);
    expect(adapter.affectedRows()).toBe(2);
  });

  it("executeMutation returns the inserted id for INSERT ... RETURNING", async () => {
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
    const host: { _statementLock: Promise<void> | null } = { _statementLock: null };
    let inside = 0;
    let arrivals = 0;
    const served: number[] = [];

    await Promise.all(
      Array.from({ length: 25 }, async (_unused, i) => {
        for (let stagger = 0; stagger < i % 4; stagger++) await Promise.resolve();
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
    const closing = new BetterSQLite3Adapter(":memory:");
    // eslint-disable-next-line blazetrails/require-table-teardown
    await closing.exec(`CREATE TABLE "dc" ("id" INTEGER PRIMARY KEY)`);
    const release = await acquireStatementLock(closing);
    const held = closing._statementLock;

    const queued = closing.executeMutation(`INSERT INTO "dc" DEFAULT VALUES`);
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
    const closing = new BetterSQLite3Adapter(":memory:");
    // eslint-disable-next-line blazetrails/require-table-teardown
    await closing.exec(`CREATE TABLE "dc2" ("id" INTEGER PRIMARY KEY)`);
    const release = await acquireStatementLock(closing);
    const held = closing._statementLock;

    const queued = closing.executeMutation(`INSERT INTO "dc2" DEFAULT VALUES`);
    for (let i = 0; i < 100 && closing._statementLock === held; i++) await Promise.resolve();

    closing.disconnectBang();
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
    await adapter.transaction(async () => {
      await adapter.execute(`INSERT INTO "pq" ("nick") VALUES ('a')`);
      expect(adapter.currentTransaction().isDirty()).toBe(true);
    });
  });

  it("dirties the current transaction for a read too", async () => {
    await adapter.transaction(async () => {
      await adapter.execute(`SELECT * FROM "pq"`);
      expect(adapter.currentTransaction().isDirty()).toBe(true);
    });
  });

  it("dirties the current transaction even when the statement raises", async () => {
    await adapter.transaction(async () => {
      await expect(
        adapter.execute(`INSERT INTO "no_such_table" ("x") VALUES (1)`),
      ).rejects.toThrow();
      expect(adapter.currentTransaction().isDirty()).toBe(true);
    });
  });
  it("internalExecute prepares when prepare is true", async () => {
    const pool = (adapter as unknown as { _statements: { get(sql: string): unknown } })._statements;
    await adapter.internalExecute(`SELECT 1`, "SQL", [], { prepare: true });
    expect(pool.get(`SELECT 1`)).toBeTruthy();
  });

  it("internalExecute does not prepare when prepare is false", async () => {
    const pool = (adapter as unknown as { _statements: { get(sql: string): unknown } })._statements;
    await adapter.internalExecute(`SELECT 2`, "SQL", [], { prepare: false });
    expect(pool.get(`SELECT 2`)).toBeFalsy();
  });
  it("internalExecute binds through to the driver", async () => {
    await adapter.internalExecute(
      `INSERT INTO "pq" ("id", "nick") VALUES (?, ?)`,
      "SQL",
      [7, "bound"],
      {},
    );
    expect(await adapter.queryValue(`SELECT "nick" FROM "pq" WHERE "id" = 7`)).toBe("bound");
  });

  it("internalExecute binds through to the driver when prepare is true", async () => {
    await adapter.internalExecute(
      `INSERT INTO "pq" ("id", "nick") VALUES (?, ?)`,
      "SQL",
      [8, "prepared"],
      {
        prepare: true,
      },
    );
    expect(await adapter.queryValue(`SELECT "nick" FROM "pq" WHERE "id" = 8`)).toBe("prepared");
  });

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
