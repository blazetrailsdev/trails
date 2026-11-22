import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
import { SQLite3 } from "../lib/index.js";
import { engine } from "../lib/engine/better-sqlite3.js";

describe("IntegrationStatementTestCase", () => {
  let db: InstanceType<typeof SQLite3.Database>;
  let stmt: Awaited<ReturnType<typeof SQLite3.Statement.new>>;

  beforeEach(async () => {
    db = new SQLite3.Database(":memory:", { engine });
    await db.transaction(null, async () => {
      await db.execute("create table foo ( a integer primary key, b text )");
      await db.execute("insert into foo ( b ) values ( 'foo' )");
      await db.execute("insert into foo ( b ) values ( 'bar' )");
      await db.execute("insert into foo ( b ) values ( 'baz' )");
    });
    stmt = await db.prepare("select * from foo where a in ( ?, :named )");
  });

  afterEach(async () => {
    if (!stmt.isClosed()) await stmt.close();
    await db.close();
  });

  it("bind params empty", async () => {
    expect(() => stmt.bindParams()).not.toThrow();
    expect(await stmt.executeBang()).toBeEmpty();
  });

  it("bind params array", async () => {
    await stmt.bindParams(1, 2);
    expect(((await stmt.executeBang()) as unknown[][]).length).toBe(2);
  });

  it("bind params hash", async () => {
    await stmt.bindParams({ ":named": 2 });
    expect(((await stmt.executeBang()) as unknown[][]).length).toBe(1);
  });

  it("bind params hash without colon", async () => {
    await stmt.bindParams({ named: 2 });
    expect(((await stmt.executeBang()) as unknown[][]).length).toBe(1);
  });

  it("bind params hash as symbol", async () => {
    await stmt.bindParams({ named: 2 });
    expect(((await stmt.executeBang()) as unknown[][]).length).toBe(1);
  });

  it("bind params mixed", async () => {
    await stmt.bindParams(1, { ":named": 2 });
    expect(((await stmt.executeBang()) as unknown[][]).length).toBe(2);
  });

  it("columns", async () => {
    const c1 = await stmt.columns();
    const c2 = await stmt.columns();
    expect(c1).toBe(c2);
    expect(c1.length).toBe(2);
  });

  it("columns computed", async () => {
    let called = false;
    await db.prepare("select count(*) from foo", async (stmt) => {
      called = true;
      expect(await stmt.columns()).toEqual(["count(*)"]);
    });
    expect(called).toBeTruthy();
  });

  it("close", async () => {
    const stmt = await db.prepare("select * from foo");
    expect(stmt.isClosed()).toBeFalsy();
    await stmt.close();
    expect(stmt.isClosed()).toBeTruthy();
    expect(() => stmt.execute()).toThrow(SQLite3.Exception);
    await expect(stmt.executeBang()).rejects.toThrow(SQLite3.Exception);
    expect(() => stmt.close()).toThrow(SQLite3.Exception);
    expect(() => stmt.bindParams(5)).toThrow(SQLite3.Exception);
    expect(() => stmt.bindParam(1, 5)).toThrow(SQLite3.Exception);
    expect(() => stmt.columns()).toThrow(SQLite3.Exception);
    expect(() => stmt.types()).toThrow(SQLite3.Exception);
  });
});
