import { describe, expect, it } from "vitest";
import { runtime } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../lib/index.js";
import { engine } from "../lib/engine/bun-sqlite.js";

describe.skipIf(runtime() !== "bun")("SQLite3::Database over the bun-sqlite engine", () => {
  it("runs a batch, then reads rows and changes back through a prepared statement", async () => {
    const db = new SQLite3.Database(":memory:", { engine });
    await db.executeBatch2("CREATE TABLE t (a INTEGER, b TEXT); INSERT INTO t VALUES (1, 'x');");
    expect(await db.changes()).toBe(1);
    expect(await db.execute("SELECT a, b FROM t WHERE a = ?", [1])).toEqual([[1, "x"]]);
    expect(await db.execute("SELECT b FROM t WHERE a = :a", { a: 1 })).toEqual([["x"]]);
    const stmt = await db.prepare("SELECT 1; SELECT 2");
    expect(stmt.remainder).toBe(" SELECT 2");
    await stmt.close();
  });

  it("closed db behavior", async () => {
    const db = new SQLite3.Database(":memory:", { engine });
    const stmt = await SQLite3.Statement.new(db, "select 'foo'");
    await db.close();
    expect(db.isClosed()).toBe(true);
    expect(await stmt.execute()).not.toBeNull();
    await stmt.close();
  });

  it("raises SQLite3::SQLException for a syntax error", async () => {
    const db = new SQLite3.Database(":memory:", { engine });
    await expect(db.execute("selec")).rejects.toBeInstanceOf(SQLite3.SQLException);
  });
});
