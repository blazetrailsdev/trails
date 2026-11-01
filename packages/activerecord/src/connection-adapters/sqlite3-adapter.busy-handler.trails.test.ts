import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BetterSQLite3Adapter } from "./better-sqlite3-adapter.js";

describe("SQLite3Adapter busy handler", () => {
  let dir: string;
  let writer: BetterSQLite3Adapter;
  let waiter: BetterSQLite3Adapter;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "sqlite-busy-"));
    const database = join(dir, "busy.sqlite3");
    writer = new BetterSQLite3Adapter({ database, timeout: 1000 });
    waiter = new BetterSQLite3Adapter({ database, timeout: 1000 });
    await writer.execute("CREATE TABLE t (id INTEGER)");
  });

  afterEach(async () => {
    await writer.dropTable("t");
    await writer.disconnectBang();
    await waiter.disconnectBang();
    rmSync(dir, { recursive: true, force: true });
  });

  it("yields the event loop while it waits, so the lock holder can commit", async () => {
    await writer.execute("BEGIN IMMEDIATE");
    await writer.execute("INSERT INTO t VALUES (1)");
    setTimeout(() => void writer.execute("COMMIT"), 20);

    await waiter.execute("INSERT INTO t VALUES (2)");

    const rows = (await waiter.execute("SELECT COUNT(*) AS n FROM t"))!;
    expect(Number(rows[0].n)).toBe(2);
  });

  it("does not replay a batch that stays blocked", async () => {
    await waiter.execute("SELECT 1");
    await writer.execute("BEGIN IMMEDIATE");
    await writer.execute("INSERT INTO t VALUES (1)");

    await expect(
      waiter.performQuery(
        waiter._rawConnection!,
        "INSERT INTO t VALUES (2); INSERT INTO t VALUES (3);",
        [],
        [],
        { prepare: false, batch: true },
      ),
    ).rejects.toThrow(/locked/);
    await writer.execute("COMMIT");

    const rows = (await waiter.execute("SELECT COUNT(*) AS n FROM t"))!;
    expect(Number(rows[0].n)).toBe(1);
  });

  it("leaves the driver's busy timeout alone when no timeout is configured", async () => {
    const unconfigured = new BetterSQLite3Adapter({ database: join(dir, "busy.sqlite3") });
    await unconfigured.execute("SELECT 1");
    const read = async () => (await unconfigured.execute("PRAGMA busy_timeout"))![0];
    const before = await read();

    await unconfigured.performQuery(unconfigured._rawConnection!, "SELECT 1; SELECT 2;", [], [], {
      prepare: false,
      batch: true,
    });

    expect(await read()).toEqual(before);
    await unconfigured.disconnectBang();
  });

  it("waits at each statement of a batch, so the lock holder can commit", async () => {
    await waiter.execute("SELECT 1");
    await writer.execute("BEGIN IMMEDIATE");
    let turns = 0;
    const ticker = setInterval(() => turns++, 1);
    setTimeout(() => void writer.execute("COMMIT"), 20);

    await waiter.performQuery(
      waiter._rawConnection!,
      `CREATE TRIGGER t_ai AFTER INSERT ON t BEGIN UPDATE t SET id = 9 WHERE id = ';'; END;
       -- a comment; with a semicolon
       INSERT INTO t VALUES (2); INSERT INTO t VALUES (3);`,
      [],
      [],
      { prepare: false, batch: true },
    );
    clearInterval(ticker);

    expect(turns).toBeGreaterThan(0);
    const rows = (await waiter.execute("SELECT COUNT(*) AS n FROM t"))!;
    expect(Number(rows[0].n)).toBe(2);
    await waiter.execute("DROP TRIGGER t_ai");
  });

  it("raises a deadlock at once instead of waiting for the timeout", async () => {
    await waiter.execute("BEGIN DEFERRED");
    vi.spyOn(waiter, "isTransactionOpen").mockReturnValue(true);
    await waiter.execute("SELECT * FROM t");
    await writer.execute("BEGIN IMMEDIATE");
    const started = Date.now();

    await expect(waiter.execute("INSERT INTO t VALUES (2)")).rejects.toThrow(/locked/);

    expect(Date.now() - started).toBeLessThan(500);
    await writer.execute("ROLLBACK");
    await waiter.execute("ROLLBACK");
  });

  it("raises a deadlock in a batch at once", async () => {
    await waiter.execute("BEGIN DEFERRED");
    vi.spyOn(waiter, "isTransactionOpen").mockReturnValue(true);
    await waiter.execute("SELECT * FROM t");
    await writer.execute("BEGIN IMMEDIATE");
    const started = Date.now();

    await expect(
      waiter.performQuery(waiter._rawConnection!, "INSERT INTO t VALUES (2);", [], [], {
        prepare: false,
        batch: true,
      }),
    ).rejects.toThrow(/locked/);

    expect(Date.now() - started).toBeLessThan(500);
    await writer.execute("ROLLBACK");
    await waiter.execute("ROLLBACK");
  });

  it("waits out a lock while it sets the configured pragmas", async () => {
    const database = join(dir, "pragma.sqlite3");
    const holder = new BetterSQLite3Adapter({ database, pragmas: { journal_mode: "delete" } });
    await holder.execute("CREATE TABLE p (id INTEGER)");
    await holder.execute("BEGIN EXCLUSIVE");
    setTimeout(() => void holder.execute("COMMIT"), 20);

    const late = new BetterSQLite3Adapter({ database, timeout: 1000 });
    try {
      await late.execute("SELECT 1");
    } finally {
      await late.disconnectBang();
      await holder.dropTable("p");
      await holder.disconnectBang();
    }
  });

  it("does not read a PRAGMA in a transaction as a held lock", async () => {
    await waiter.execute("BEGIN DEFERRED");
    vi.spyOn(waiter, "isTransactionOpen").mockReturnValue(true);
    await waiter.execute("PRAGMA table_info(t)");

    expect(waiter._sharedLockHeld).toBe(false);
    await waiter.execute("ROLLBACK");
  });

  it("retries a retries config that many times, then raises", async () => {
    const retrying = new BetterSQLite3Adapter({
      database: join(dir, "busy.sqlite3"),
      retries: 2,
    });
    await retrying.execute("SELECT 1");
    const counts: number[] = [];
    const busyHandler = retrying._rawConnection!.busyHandler!;
    retrying._rawConnection!.busyHandler = (count) => {
      counts.push(count);
      return busyHandler(count);
    };
    await writer.execute("BEGIN IMMEDIATE");

    await expect(retrying.execute("INSERT INTO t VALUES (2)")).rejects.toThrow(/locked/);

    expect(counts).toEqual([0, 1, 2, 3]);
    await writer.execute("ROLLBACK");
    await retrying.disconnectBang();
  });

  it("raises at once when no timeout is configured", async () => {
    const unconfigured = new BetterSQLite3Adapter({ database: join(dir, "busy.sqlite3") });
    await unconfigured.execute("SELECT 1");
    await writer.execute("BEGIN IMMEDIATE");
    const started = Date.now();

    await expect(unconfigured.execute("INSERT INTO t VALUES (2)")).rejects.toThrow(/locked/);

    expect(Date.now() - started).toBeLessThan(500);
    await writer.execute("ROLLBACK");
    await unconfigured.disconnectBang();
  });

  it("raises once the timeout has passed", async () => {
    const impatient = new BetterSQLite3Adapter({
      database: join(dir, "busy.sqlite3"),
      timeout: 30,
    });
    await writer.execute("BEGIN IMMEDIATE");
    await expect(impatient.execute("INSERT INTO t VALUES (2)")).rejects.toThrow(/locked/);
    await writer.execute("ROLLBACK");
    await impatient.disconnectBang();
  });
});
