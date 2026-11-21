import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SQLite3 } from "../lib/index.js";
import { engine } from "../lib/engine/better-sqlite3.js";

describe("TestDatabase", () => {
  let db: InstanceType<typeof SQLite3.Database>;

  beforeEach(() => {
    db = new SQLite3.Database(":memory:", { engine });
  });

  afterEach(async () => {
    if (!db.isClosed()) await db.close();
  });

  it("encoding", async () => {
    expect(await db.encoding()).toBeTruthy();
  });

  it("new", async () => {
    let db: InstanceType<typeof SQLite3.Database> | undefined;
    try {
      db = new SQLite3.Database(":memory:", { engine });
      expect(db).toBeInstanceOf(SQLite3.Database);
    } finally {
      await db?.close();
    }
  });

  it("close", async () => {
    const db = new SQLite3.Database(":memory:", { engine });
    await db.close();
    expect(db.isClosed()).toBeTruthy();
  });

  it("prepare", async () => {
    const db = new SQLite3.Database(":memory:", { engine });
    let stmt: InstanceType<typeof SQLite3.Statement> | undefined;
    try {
      stmt = db.prepare("select 'hello world'");
      expect(stmt).toBeInstanceOf(SQLite3.Statement);
    } finally {
      await stmt?.close();
    }
  });

  it("block prepare does not double close", async () => {
    const db = new SQLite3.Database(":memory:", { engine });
    const r = await db.prepare("select 'hello world'", async (stmt) => {
      await stmt.close();
      return "foo";
    });
    expect(r).toBe("foo");
  });

  it("close with open statements", async () => {
    const s = db.prepare("select 'foo'");
    try {
      expect(() => db.close()).not.toThrow();
    } finally {
      await s.close();
    }
  });

  it("execute with empty bind params", async () => {
    expect(await db.execute("select 'foo'", [])).toEqual([["foo"]]);
  });

  it("execute with named bind params", async () => {
    expect(await db.execute("select :n", { n: "foo" })).toEqual([["foo"]]);
  });

  it("query with named bind params", async () => {
    const resultset = (await db.query("select :n", { n: "foo" })) as InstanceType<
      typeof SQLite3.ResultSet
    >;
    try {
      expect(await resultset.toA()).toEqual([["foo"]]);
    } finally {
      await resultset.close();
    }
  });
});
