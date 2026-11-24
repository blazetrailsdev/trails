import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SQLite3Adapter } from "../../../lib/connection-adapters/sqlite3-adapter.js";
import { SQLite3 } from "@blazetrails/sqlite3";

describe("SQLite3Adapter busy handler", () => {
  let dir: string;
  let writer: SQLite3Adapter;
  let waiter: SQLite3Adapter;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "sqlite-busy-"));
    const database = join(dir, "busy.sqlite3");
    writer = new SQLite3Adapter({ database, timeout: 1000 });
    waiter = new SQLite3Adapter({ database, timeout: 1000 });
    await writer.execute("CREATE TABLE t (id INTEGER)");
  });

  afterEach(async () => {
    await writer.dropTable("t");
    await writer.disconnectBang();
    await waiter.disconnectBang();
    rmSync(dir, { recursive: true, force: true });
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
    const unconfigured = new SQLite3Adapter({ database: join(dir, "busy.sqlite3") });
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

  it("retries a retries config that many times, then raises", async () => {
    const retrying = new SQLite3Adapter({
      database: join(dir, "busy.sqlite3"),
      retries: 2,
    });
    const set = vi.spyOn(SQLite3.Database.prototype, "busyHandler");
    await retrying.execute("SELECT 1");
    const counts: number[] = [];
    const busyHandler = set.mock.calls.at(-1)![0]!;
    retrying._rawConnection!.busyHandler((count) => {
      counts.push(count);
      return busyHandler(count);
    });
    await writer.execute("BEGIN IMMEDIATE");

    await expect(retrying.execute("INSERT INTO t VALUES (2)")).rejects.toThrow(/locked/);

    expect(counts).toEqual([0, 1, 2, 3]);
    await writer.execute("ROLLBACK");
    await retrying.disconnectBang();
  });

  it("raises at once when no timeout is configured", async () => {
    const unconfigured = new SQLite3Adapter({ database: join(dir, "busy.sqlite3") });
    await unconfigured.execute("SELECT 1");
    await writer.execute("BEGIN IMMEDIATE");
    const started = Date.now();

    await expect(unconfigured.execute("INSERT INTO t VALUES (2)")).rejects.toThrow(/locked/);

    expect(Date.now() - started).toBeLessThan(500);
    await writer.execute("ROLLBACK");
    await unconfigured.disconnectBang();
  });

  it("raises once the timeout has passed", async () => {
    const impatient = new SQLite3Adapter({
      database: join(dir, "busy.sqlite3"),
      timeout: 30,
    });
    await writer.execute("BEGIN IMMEDIATE");
    await expect(impatient.execute("INSERT INTO t VALUES (2)")).rejects.toThrow(/locked/);
    await writer.execute("ROLLBACK");
    await impatient.disconnectBang();
  });
});
