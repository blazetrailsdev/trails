import { afterEach, describe, expect, it } from "vitest";
import { File, getOs } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../lib/index.js";
import { engine } from "../lib/engine/node-sqlite.js";

describe("SQLite3::Database over the node-sqlite engine", () => {
  const paths: string[] = [];
  afterEach(() => {
    for (const p of paths.splice(0)) if (File.isExist(p)) File.delete(p);
  });

  it("runs a batch, then reads rows and changes back through a prepared statement", async () => {
    const db = new SQLite3.Database(":memory:", { engine });
    await db.executeBatch2("CREATE TABLE t (a INTEGER, b TEXT); INSERT INTO t VALUES (1, 'x');");
    expect(await db.changes()).toBe(1);
    expect(await db.execute("SELECT a, b FROM t WHERE a = ?", [1])).toEqual([[1, "x"]]);
    const stmt = db.prepare("SELECT 1; SELECT 2");
    expect(stmt.remainder).toBe(" SELECT 2");
    await stmt.close();
  });

  it("raises the gem's class for a failed prepare, with the SQL", () => {
    const db = new SQLite3.Database(":memory:", { engine });
    expect(() => db.prepare("SELECT * FROM nope")).toThrow(SQLite3.SQLException);
    try {
      db.prepare("SELECT * FROM nope");
    } catch (e) {
      expect((e as InstanceType<typeof SQLite3.Exception>).sql).toBe("SELECT * FROM nope");
    }
  });

  it("raises the gem's class for a failed step", async () => {
    const db = new SQLite3.Database(":memory:", { engine });
    await db.executeBatch2("CREATE TABLE u (a INTEGER UNIQUE); INSERT INTO u VALUES (1);");
    await expect(db.execute("INSERT INTO u VALUES (1)")).rejects.toBeInstanceOf(
      SQLite3.ConstraintException,
    );
  });

  it("raises CantOpenException for a file in a missing directory", () => {
    expect(() => new SQLite3.Database("/nonexistent-dir/x.sqlite3", { engine })).toThrow(
      SQLite3.CantOpenException,
    );
  });

  it("opens readonly when asked, as open_v2's READONLY flag", async () => {
    const db = new SQLite3.Database(":memory:", { engine, readonly: true });
    await expect(db.execute("CREATE TABLE t (a)")).rejects.toBeInstanceOf(
      SQLite3.ReadOnlyException,
    );
  });

  it("calls the busy handler with a growing count until it answers false, as retries does", async () => {
    const path = `${getOs().tmpdir()}/engine-busy-${Date.now()}.sqlite3`;
    paths.push(path);
    const holder = new SQLite3.Database(path, { engine });
    await holder.executeBatch2("CREATE TABLE t (a); BEGIN EXCLUSIVE;");
    const waiter = new SQLite3.Database(path, { engine });
    const retries = 2;
    const counts: number[] = [];
    waiter.busyHandler((count) => (counts.push(count), count <= retries));
    await expect(waiter.execute("SELECT * FROM t")).rejects.toBeInstanceOf(SQLite3.BusyException);
    expect(counts).toEqual([0, 1, 2, 3]);
    await holder.executeBatch2("ROLLBACK");
    await holder.close();
    await waiter.close();
  });

  it("setBusyHandlerTimeout retries until the deadline, then raises BusyException", async () => {
    const path = `${getOs().tmpdir()}/engine-busy-timeout-${Date.now()}.sqlite3`;
    paths.push(path);
    const holder = new SQLite3.Database(path, { engine });
    await holder.executeBatch2("CREATE TABLE t (a); BEGIN EXCLUSIVE;");
    const waiter = new SQLite3.Database(path, { engine });
    waiter.setBusyHandlerTimeout(20);
    const started = performance.now();
    await expect(waiter.execute("SELECT * FROM t")).rejects.toBeInstanceOf(SQLite3.BusyException);
    expect(performance.now() - started).toBeGreaterThanOrEqual(20);
    await holder.executeBatch2("ROLLBACK");
    await holder.close();
    await waiter.close();
  });

  it("binds a named parameter by its exact name, and rejects a prefix of another", async () => {
    const db = new SQLite3.Database(":memory:", { engine });
    const stmt = db.prepare("SELECT :idx AS v");
    expect(() => stmt.bindParam(":id", 1)).toThrow("no such bind parameter");
    await stmt.bindParam(":idx", 2);
    expect(await stmt.step()).toEqual([2]);
    await stmt.close();
  });

  it("binds unsupplied placeholders as NULL, ignoring a ? inside a string literal", async () => {
    const db = new SQLite3.Database(":memory:", { engine });
    expect(await db.execute("SELECT '?', ?, ?")).toEqual([["?", null, null]]);
  });

  it("execute_batch2 answers sqlite3_exec's column text, and skips a comment-only tail", async () => {
    const db = new SQLite3.Database(":memory:", { engine });
    expect(await db.executeBatch2("SELECT 1.0, 0.1 + 0.2, 7, NULL; -- trailing")).toEqual([
      ["1.0", "0.3", "7", null],
    ]);
    expect(await db.executeBatch2("SELECT 1e20, 1.5e-5, 2.5")).toEqual([
      ["1.0e+20", "1.5e-05", "2.5"],
    ]);
  });

  it("does not restart a statement already part-way through its rows", async () => {
    const db = new SQLite3.Database(":memory:", { engine });
    await db.executeBatch2("CREATE TABLE r (a); INSERT INTO r VALUES (1), (2), (3);");
    const stmt = db.prepare("SELECT a FROM r ORDER BY a");
    const rows: unknown[] = [];
    for (let row = await stmt.step(); row !== null; row = await stmt.step()) rows.push(row);
    expect(rows).toEqual([[1], [2], [3]]);
    await stmt.close();
  });

  it("rejects a named parameter that appears only inside a string literal or comment", () => {
    const db = new SQLite3.Database(":memory:", { engine });
    const stmt = db.prepare("SELECT ':foo', ? AS [a:baz] -- :bar");
    expect(() => stmt.bindParam(":foo", 1)).toThrow("no such bind parameter");
    expect(() => stmt.bindParam(":bar", 1)).toThrow("no such bind parameter");
    expect(() => stmt.bindParam(":baz", 1)).toThrow("no such bind parameter");
  });
});
