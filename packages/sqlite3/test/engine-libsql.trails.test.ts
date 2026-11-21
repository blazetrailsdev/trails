import { afterEach, describe, expect, it } from "vitest";
import { File, RuntimeError, getOs } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../lib/index.js";
import { engine, remoteEngine, replicaEngine } from "../lib/engine/libsql.js";

describe("SQLite3::Database over the libsql engine", () => {
  const paths: string[] = [];
  afterEach(() => {
    for (const p of paths.splice(0)) if (File.isExist(p)) File.delete(p);
  });

  it("runs a batch, then reads rows and changes back through a prepared statement", async () => {
    const db = new SQLite3.Database(":memory:", { engine });
    await db.executeBatch2("CREATE TABLE t (a INTEGER, b TEXT); INSERT INTO t VALUES (1, 'x');");
    expect(await db.changes()).toBe(1);
    expect(await db.execute("SELECT a, b FROM t WHERE a = ?", [1])).toEqual([[1, "x"]]);
    expect(await db.executeBatch2("SELECT a, b FROM t")).toEqual([["1", "x"]]);
    const stmt = db.prepare("SELECT 1; SELECT 2");
    expect(stmt.remainder).toBe(" SELECT 2");
    await stmt.close();
  });

  it("binds named parameters", async () => {
    const db = new SQLite3.Database(":memory:", { engine });
    expect(await db.execute("SELECT :a, $b", { a: 1, b: 2 })).toEqual([[1, 2]]);
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

  it("opens a shared-cache file for SQLITE_OPEN_SHAREDCACHE", async () => {
    const path = `${getOs().tmpdir()}/engine-libsql-shared-${Date.now()}.sqlite3`;
    paths.push(path);
    const { Open } = SQLite3.Constants;
    const flags = Open.READWRITE | Open.CREATE | Open.SHAREDCACHE;
    const db = new SQLite3.Database(path, { engine, flags });
    await db.executeBatch2("CREATE TABLE t (a)");
    expect(File.isExist(path)).toBe(true);
    await db.close();
  });

  it("refuses SQLITE_OPEN_SHAREDCACHE on the remote engine", () => {
    const { Open } = SQLite3.Constants;
    const flags = Open.READWRITE | Open.CREATE | Open.SHAREDCACHE;
    expect(
      () => new SQLite3.Database("http://127.0.0.1:1", { engine: remoteEngine(), flags }),
    ).toThrow(RuntimeError);
  });

  it("requires a syncUrl and a positive syncPeriod for the replica engine", () => {
    expect(() => replicaEngine({})).toThrow(/requires a non-empty `syncUrl`/);
    expect(() => replicaEngine({ syncUrl: "http://127.0.0.1:1", syncPeriod: 0 })).toThrow(
      /must be a positive number/,
    );
  });
});
