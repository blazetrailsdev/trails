import { afterEach, describe, expect, it } from "vitest";
import { File, getOs } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../lib/index.js";
import { engine } from "../lib/engine/better-sqlite3.js";

describe("SQLite3::Database over the better-sqlite3 engine", () => {
  const paths: string[] = [];
  afterEach(() => {
    for (const p of paths.splice(0)) if (File.isExist(p)) File.delete(p);
  });

  it("runs a batch, then reads rows and changes back through a prepared statement", async () => {
    const db = new SQLite3.Database(":memory:", { engine });
    await db.executeBatch2("CREATE TABLE t (a INTEGER, b TEXT); INSERT INTO t VALUES (1, 'x');");
    expect(await db.changes()).toBe(1);
    expect(await db.execute("SELECT a, b FROM t WHERE a = ?", [1])).toEqual([[1, "x"]]);
    const stmt = await db.prepare("SELECT 1; SELECT 2");
    expect(stmt.remainder).toBe(" SELECT 2");
    await stmt.close();
  });

  it("awaits a busy handler that answers a promise, so the lock holder can commit", async () => {
    const path = `${getOs().tmpdir()}/engine-busy-promise-${Date.now()}-${Math.random()}.sqlite3`;
    paths.push(path);
    const holder = new SQLite3.Database(path, { engine });
    await holder.executeBatch2("CREATE TABLE t (a); BEGIN EXCLUSIVE; INSERT INTO t VALUES (1)");
    const waiter = new SQLite3.Database(path, { engine });
    waiter.setBusyHandlerTimeout(1000);
    const commit = new Promise((resolve) => setTimeout(resolve, 20)).then(() =>
      holder.executeBatch2("COMMIT"),
    );
    expect(await waiter.execute("SELECT a FROM t")).toEqual([[1]]);
    await commit;
    await waiter.close();
    await holder.close();
  });

  it("raises the gem's class for a failed prepare, with the SQL", async () => {
    const db = new SQLite3.Database(":memory:", { engine });
    expect(() => db.prepare("SELECT * FROM nope")).toThrow(SQLite3.SQLException);
    try {
      await db.prepare("SELECT * FROM nope");
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
    const path = `${getOs().tmpdir()}/engine-busy-${Date.now()}-${Math.random()}.sqlite3`;
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

  it("skips the busy handler for a write that would deadlock on a held read lock", async () => {
    const path = `${getOs().tmpdir()}/engine-deadlock-${Date.now()}-${Math.random()}.sqlite3`;
    paths.push(path);
    const holder = new SQLite3.Database(path, { engine });
    await holder.executeBatch2("CREATE TABLE t (a); INSERT INTO t VALUES (1);");
    const reader = new SQLite3.Database(path, { engine });
    reader.setBusyHandlerTimeout(1000);
    await reader.execute("BEGIN DEFERRED");
    expect(await reader.execute("SELECT * FROM t")).toEqual([[1]]);
    await holder.execute("BEGIN IMMEDIATE");
    const started = performance.now();
    await expect(reader.execute("INSERT INTO t VALUES (2)")).rejects.toBeInstanceOf(
      SQLite3.BusyException,
    );
    expect(performance.now() - started).toBeLessThan(500);
    await reader.execute("ROLLBACK");
    await holder.execute("ROLLBACK");
    await holder.close();
    await reader.close();
  });

  it("calls the busy handler for a write after a statement that took no read lock", async () => {
    const path = `${getOs().tmpdir()}/engine-nodeadlock-${Date.now()}-${Math.random()}.sqlite3`;
    paths.push(path);
    const holder = new SQLite3.Database(path, { engine });
    await holder.executeBatch2("CREATE TABLE t (a);");
    const writer = new SQLite3.Database(path, { engine });
    const counts: number[] = [];
    writer.busyHandler((count) => (counts.push(count), count < 2));
    await writer.execute("BEGIN DEFERRED");
    await writer.execute("SAVEPOINT a");
    await holder.execute("BEGIN IMMEDIATE");
    await expect(writer.execute("INSERT INTO t VALUES (2)")).rejects.toBeInstanceOf(
      SQLite3.BusyException,
    );
    expect(counts).toEqual([0, 1, 2]);
    await writer.execute("ROLLBACK");
    await holder.execute("ROLLBACK");
    await holder.close();
    await writer.close();
  });

  it("calls the busy handler for a COMMIT that waits on a reader after the transaction wrote", async () => {
    const path = `${getOs().tmpdir()}/engine-commitwait-${Date.now()}-${Math.random()}.sqlite3`;
    paths.push(path);
    const holder = new SQLite3.Database(path, { engine });
    await holder.executeBatch2("CREATE TABLE t (a); INSERT INTO t VALUES (1);");
    const writer = new SQLite3.Database(path, { engine });
    const counts: number[] = [];
    writer.busyHandler((count) => (counts.push(count), count < 2));
    await writer.execute("BEGIN DEFERRED");
    await writer.execute("SELECT * FROM t");
    await writer.execute("INSERT INTO t VALUES (2)");
    await holder.execute("BEGIN");
    await holder.execute("SELECT * FROM t");
    await expect(writer.execute("COMMIT")).rejects.toBeInstanceOf(SQLite3.BusyException);
    expect(counts).toEqual([0, 1, 2]);
    await holder.execute("ROLLBACK");
    await writer.execute("ROLLBACK");
    await holder.close();
    await writer.close();
  });

  it("reads an INTEGER as a number when it is safe and as a bigint past 2^53", async () => {
    const db = new SQLite3.Database(":memory:", { engine });
    expect(await db.execute("SELECT 7, 9007199254740993, -9007199254740993, 1.5")).toEqual([
      [7, 9007199254740993n, -9007199254740993n, 1.5],
    ]);
    await db.close();
  });

  it("setBusyHandlerTimeout retries until the deadline, then raises BusyException", async () => {
    const path = `${getOs().tmpdir()}/engine-busy-timeout-${Date.now()}-${Math.random()}.sqlite3`;
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
    const stmt = await db.prepare("SELECT :idx AS v");
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
    const stmt = await db.prepare("SELECT a FROM r ORDER BY a");
    const rows: unknown[] = [];
    for (let row = await stmt.step(); row !== null; row = await stmt.step()) rows.push(row);
    expect(rows).toEqual([[1], [2], [3]]);
    await stmt.close();
  });

  it("binds ?NNN placeholders by index, reading an unsupplied one as NULL", async () => {
    const db = new SQLite3.Database(":memory:", { engine });
    const stmt = await db.prepare("SELECT ?2, ?, ?5");
    await stmt.bindParam(2, "b");
    await stmt.bindParam(3, "c");
    expect(await stmt.step()).toEqual(["b", "c", null]);
    await stmt.close();
    expect(await db.execute("SELECT ?2, ?1", ["a", "b"])).toEqual([["b", "a"]]);
  });

  it("numbers a bare ? after a ?NNN as SQLite does", async () => {
    const db = new SQLite3.Database(":memory:", { engine });
    expect(await db.execute("SELECT ?2, ?", ["a", "b", "c"])).toEqual([["b", "c"]]);
    expect(await db.execute("SELECT ?, ?1", ["a"])).toEqual([["a", "a"]]);
  });

  it("rejects a double-quoted string under strict, as the gem's disable_quirk_mode does", async () => {
    const db = new SQLite3.Database(":memory:", { engine, strict: true });
    await expect(db.execute('SELECT "nope"')).rejects.toThrow(SQLite3.SQLException);
    await db.close();
  });
});
