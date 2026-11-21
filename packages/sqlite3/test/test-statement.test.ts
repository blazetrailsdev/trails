import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../lib/index.js";
import { engine } from "../lib/engine/better-sqlite3.js";

describe("TestStatement", () => {
  let db: InstanceType<typeof SQLite3.Database>;
  let stmt: InstanceType<typeof SQLite3.Statement>;

  beforeEach(() => {
    db = new SQLite3.Database(":memory:", { engine });
    stmt = new SQLite3.Statement(db, "select 'foo'");
  });

  afterEach(async () => {
    if (!stmt.isClosed()) await stmt.close();
    if (!db.isClosed()) await db.close();
  });

  it("new", async () => {
    expect(stmt).toBeTruthy();
  });

  it("new closed handle", async () => {
    db = new SQLite3.Database(":memory:", { engine });
    await db.close();
    expect(() => new SQLite3.Statement(db, 'select "foo"')).toThrow(ArgumentError);
  });

  it("empty remainder", async () => {
    expect(stmt.remainder).toBe("");
  });

  it("close", async () => {
    await stmt.close();
    expect(stmt.isClosed()).toBeTruthy();
  });

  it("double close", async () => {
    await stmt.close();
    expect(() => stmt.close()).toThrow(SQLite3.Exception);
  });

  it("bind param string", async () => {
    const stmt = new SQLite3.Statement(db, "select ?");
    await stmt.bindParam(1, "hello");
    let result: unknown = null;
    await stmt.each((x) => {
      result = x;
    });
    expect(result).toEqual(["hello"]);
    await stmt.close();
  });

  it("bind param int", async () => {
    const stmt = new SQLite3.Statement(db, "select ?");
    await stmt.bindParam(1, 10);
    let result: unknown = null;
    await stmt.each((x) => {
      result = x;
    });
    expect(result).toEqual([10]);
    await stmt.close();
  });

  it("bind nil", async () => {
    const stmt = new SQLite3.Statement(db, "select ?");
    await stmt.bindParam(1, null);
    let result: unknown = null;
    await stmt.each((x) => {
      result = x;
    });
    expect(result).toEqual([null]);
    await stmt.close();
  });

  it("bind 64", async () => {
    const stmt = new SQLite3.Statement(db, "select ?");
    await stmt.bindParam(1, 2 ** 31);
    let result: unknown = null;
    await stmt.each((x) => {
      result = x;
    });
    expect(result).toEqual([2 ** 31]);
    await stmt.close();
  });

  it("bind double", async () => {
    const stmt = new SQLite3.Statement(db, "select ?");
    await stmt.bindParam(1, 2.2);
    let result: unknown = null;
    await stmt.each((x) => {
      result = x;
    });
    expect(result).toEqual([2.2]);
    await stmt.close();
  });

  it("named bind", async () => {
    const stmt = new SQLite3.Statement(db, "select :foo");
    await stmt.bindParam(":foo", "hello");
    let result: unknown = null;
    await stmt.each((x) => {
      result = x;
    });
    expect(result).toEqual(["hello"]);
    await stmt.close();
  });

  it("named bind no colon", async () => {
    const stmt = new SQLite3.Statement(db, "select :foo");
    await stmt.bindParam("foo", "hello");
    let result: unknown = null;
    await stmt.each((x) => {
      result = x;
    });
    expect(result).toEqual(["hello"]);
    await stmt.close();
  });

  it("named bind symbol", async () => {
    const stmt = new SQLite3.Statement(db, "select :foo");
    await stmt.bindParam("foo", "hello");
    let result: unknown = null;
    await stmt.each((x) => {
      result = x;
    });
    expect(result).toEqual(["hello"]);
    await stmt.close();
  });

  it("named bind not found", async () => {
    const s = new SQLite3.Statement(db, "select :foo");
    expect(() => s.bindParam("bar", "hello")).toThrow(SQLite3.Exception);
    await s.close();
  });

  it("each", async () => {
    let r: unknown = null;
    await stmt.each((row) => {
      r = row;
    });
    expect(r).toEqual(["foo"]);
  });

  it("reset!", async () => {
    const r: unknown[] = [];
    await stmt.each((row) => r.push(row));
    await stmt.resetBang();
    await stmt.each((row) => r.push(row));
    expect(r).toEqual([["foo"], ["foo"]]);
  });

  it("step", async () => {
    expect(await stmt.step()).toEqual(["foo"]);
  });

  it("step twice", async () => {
    expect(await stmt.step()).not.toBeNull();
    expect(stmt.isDone()).toBeFalsy();
    expect(await stmt.step()).toBeNull();
    expect(stmt.isDone()).toBeTruthy();

    await stmt.resetBang();
    expect(stmt.isDone()).toBeFalsy();
  });

  it("step never moves past done", async () => {
    for (let i = 0; i < 10; i++) await stmt.step();
    stmt.isDone();
  });

  it("column count", async () => {
    expect(await stmt.columnCount()).toBe(1);
  });

  it("column name", async () => {
    expect(await stmt.columnName(0)).toBe("'foo'");
    expect(await stmt.columnName(10)).toBeNull();
  });
});
