import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
import { block } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../lib/index.js";
import { engine } from "../lib/engine/better-sqlite3.js";
import { engine as nodeEngine } from "../lib/engine/node-sqlite.js";

describe("IntegrationTestCase", () => {
  let db: InstanceType<typeof SQLite3.Database>;

  beforeEach(async () => {
    db = new SQLite3.Database(":memory:", { engine });
    await db.transaction(null, async () => {
      await db.execute("create table foo ( a integer primary key, b text )");
      await db.execute("insert into foo ( b ) values ( 'foo' )");
      await db.execute("insert into foo ( b ) values ( 'bar' )");
      await db.execute("insert into foo ( b ) values ( 'baz' )");
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it("prepare invalid syntax", async () => {
    await expect(async () => db.prepare("select from foo")).rejects.toThrow(SQLite3.SQLException);
  });

  it("prepare exception shows error position", async () => {
    let exception!: Error;
    await expect(
      (async () => db.prepare("select from foo"))().catch((e: Error) => {
        exception = e;
        throw e;
      }),
    ).rejects.toThrow(SQLite3.SQLException);
    expect(exception.message).toBe('near "from": syntax error:\nselect from foo');
  });

  it("prepare exception shows error position newline1", async () => {
    let exception!: Error;
    await expect(
      (async () => db.prepare("select\nfrom foo\n"))().catch((e: Error) => {
        exception = e;
        throw e;
      }),
    ).rejects.toThrow(SQLite3.SQLException);
    expect(exception.message).toBe('near "from": syntax error:\nselect\nfrom foo');
  });

  it("prepare exception shows error position newline2", async () => {
    let exception!: Error;
    await expect(
      (async () => db.prepare("select asdf\nfrom foo\n"))().catch((e: Error) => {
        exception = e;
        throw e;
      }),
    ).rejects.toThrow(SQLite3.SQLException);
    expect(exception.message).toBe("no such column: asdf:\nselect asdf\nfrom foo");
  });

  it("prepare invalid column", async () => {
    await expect(async () => db.prepare("select k from foo")).rejects.toThrow(SQLite3.SQLException);
  });

  it("prepare invalid table", async () => {
    await expect(async () => db.prepare("select * from barf")).rejects.toThrow(
      SQLite3.SQLException,
    );
  });

  it("prepare no block", async () => {
    const stmt = await db.prepare("select * from foo");
    expect(stmt).toRespondTo("execute");
    await stmt.close();
  });

  it("changes", async () => {
    await db.execute("insert into foo ( b ) values ( 'test' )");
    expect(await db.changes()).toBe(1);
    await db.execute("delete from foo where 1=1");
    expect(await db.changes()).toBe(4);
  });

  it("transaction rollback", async () => {
    await db.transaction();
    await db.executeBatch(`
      insert into foo (b) values ( 'test1' );
      insert into foo (b) values ( 'test2' );
      insert into foo (b) values ( 'test3' );
      insert into foo (b) values ( 'test4' );
    `);
    expect(Number(await db.getFirstValue("select count(*) from foo"))).toBe(7);
    await db.rollback();
    expect(Number(await db.getFirstValue("select count(*) from foo"))).toBe(3);
  });
  it("table info with type translation active", async () => {
    await expect(db.tableInfo("foo")).resolves.not.toThrow();
  });

  describe("authorizer", () => {
    let nodeDb: InstanceType<typeof SQLite3.Database>;

    beforeEach(async () => {
      nodeDb = new SQLite3.Database(":memory:", { engine: nodeEngine });
      await nodeDb.transaction(null, async () => {
        await nodeDb.execute("create table foo ( a integer primary key, b text )");
        await nodeDb.execute("insert into foo ( b ) values ( 'foo' )");
        await nodeDb.execute("insert into foo ( b ) values ( 'bar' )");
        await nodeDb.execute("insert into foo ( b ) values ( 'baz' )");
      });
    });

    afterEach(async () => {
      await nodeDb.close();
    });

    it("authorizer okay", async () => {
      nodeDb.authorizer(() => 0);
      const rows = (await nodeDb.execute("select * from foo")) as unknown[];
      expect(rows.length).toBe(3);
    });

    it("authorizer error", async () => {
      nodeDb.authorizer(() => 1);
      await expect(nodeDb.execute("select * from foo")).rejects.toThrow(
        SQLite3.AuthorizationException,
      );
    });

    it("authorizer silent", async () => {
      nodeDb.authorizer(() => 2);
      const rows = (await nodeDb.execute("select * from foo")) as unknown[];
      expect(rows).toEqual([]);
    });
  });

  it("execute2 no block no bind no match", async () => {
    const [columns, ...rows] = (await db.execute2("select * from foo where a > 100")) as unknown[];
    expect(rows).toEqual([]);
    expect(columns).toEqual(["a", "b"]);
  });

  it("execute2 with block no bind no match", async () => {
    let called = 0;
    await db.execute2(
      "select * from foo where a > 100",
      block((row: unknown) => {
        if (called === 0) expect(row).toEqual(["a", "b"]);
        called += 1;
      }),
    );
    expect(called).toBe(1);
  });

  it("execute2 no block with bind no match", async () => {
    const [columns, ...rows] = (await db.execute2(
      "select * from foo where a > ?",
      100,
    )) as unknown[];
    expect(rows).toEqual([]);
    expect(columns).toEqual(["a", "b"]);
  });

  it("execute2 with block with bind no match", async () => {
    let called = 0;
    await db.execute2(
      "select * from foo where a > ?",
      100,
      block((row: unknown) => {
        if (called === 0) expect(row).toEqual(["a", "b"]);
        called += 1;
      }),
    );
    expect(called).toBe(1);
  });

  it("execute2 no block no bind with match", async () => {
    const [columns, ...rows] = (await db.execute2("select * from foo where a = 1")) as unknown[];
    expect(rows.length).toBe(1);
    expect(columns).toEqual(["a", "b"]);
  });

  it("execute2 with block no bind with match", async () => {
    let called = 0;
    await db.execute2(
      "select * from foo where a = 1",
      block((row: unknown) => {
        if (called !== 0) expect(row).toEqual([1, "foo"]);
        called += 1;
      }),
    );
    expect(called).toBe(2);
  });

  it("execute2 no block with bind with match", async () => {
    const [columns, ...rows] = (await db.execute2("select * from foo where a = ?", 1)) as unknown[];
    expect(rows.length).toBe(1);
    expect(columns).toEqual(["a", "b"]);
  });

  it("execute2 with block with bind with match", async () => {
    let called = 0;
    await db.execute2(
      "select * from foo where a = ?",
      1,
      block(() => {
        called += 1;
      }),
    );
    expect(called).toBe(2);
  });

  it("get first row no bind no match", async () => {
    const result = await db.getFirstRow("select * from foo where a=100");
    expect(result).toBeNull();
  });

  it("get first row no bind with match", async () => {
    const result = await db.getFirstRow("select * from foo where a=1");
    expect(result).toEqual([1, "foo"]);
  });

  it("get first row with bind no match", async () => {
    const result = await db.getFirstRow("select * from foo where a=?", 100);
    expect(result).toBeNull();
  });

  it("get first row with bind with match", async () => {
    const result = await db.getFirstRow("select * from foo where a=?", 1);
    expect(result).toEqual([1, "foo"]);
  });

  it("create function", async () => {
    db.createFunction("munge", 1, (func, x) => {
      func.result = `>>>${x}<<<`;
    });

    const value = await db.getFirstValue("select munge(b) from foo where a=1");
    expect(value).toMatch(/>>>.*<<</);
  });
});
