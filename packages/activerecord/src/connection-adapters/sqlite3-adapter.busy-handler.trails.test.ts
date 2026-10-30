import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
