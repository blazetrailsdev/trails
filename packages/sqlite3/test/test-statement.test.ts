import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../lib/index.js";
import { engine } from "../lib/engine/better-sqlite3.js";

describe("TestStatement", () => {
  let db: InstanceType<typeof SQLite3.Database>;
  let stmt: Awaited<ReturnType<typeof SQLite3.Statement.new>>;

  beforeEach(async () => {
    db = new SQLite3.Database(":memory:", { engine });
    stmt = await SQLite3.Statement.new(db, "select 'foo'");
  });

  afterEach(async () => {
    if (!stmt.isClosed()) await stmt.close();
    if (!db.isClosed()) await db.close();
  });

  it("rows should be frozen", async () => {
    await db.execute(
      'CREATE TABLE "things" ("float" float, "int" int, "text" blob, "string" string, "nil" string)',
    );
    const stmt = await db.prepare(
      "INSERT INTO things (float, int, text, string, nil) VALUES (?, ?, ?, ?, ?)",
    );
    await stmt.execute(1.2, 2, "blob", "string", null);
    await stmt.close();

    const rows = (await db.execute(
      "SELECT float, int, text, string, nil FROM things",
    )) as unknown[][];
    expect(Object.isFrozen(rows)).toBeTruthy();
    expect(rows.length).toEqual(1);
    const row = rows[0];
    expect(Object.isFrozen(row)).toBeTruthy();
    for (const item of row) expect(Object.isFrozen(item)).toBeTruthy();
  });

  it("double close does not segv", async () => {
    await db.execute('CREATE TABLE "things" ("number" float NOT NULL)');

    const stmt = await db.prepare("INSERT INTO things (number) VALUES (?)");
    await expect((async () => stmt.execute(null))()).rejects.toThrow(SQLite3.ConstraintException);

    await stmt.close();

    expect(() => stmt.close()).toThrow(SQLite3.Exception);
  });

  it("column names are deduped", async () => {
    await db.execute(
      "CREATE TABLE 'things' ('float' float, 'int' int, 'text' blob, 'string' string, 'nil' string)",
    );
    let stmt = await db.prepare("SELECT float, int, text, string, nil FROM things");
    try {
      expect(await stmt.columns()).toEqual(["float", "int", "text", "string", "nil"]);
      const columns = await stmt.columns();
      await stmt.close();

      stmt = await db.prepare("SELECT float, int, text, string, nil FROM things");
      (await stmt.columns()).forEach((str, i) => {
        expect(Object.isFrozen(columns[i])).toBeTruthy();
        expect(columns[i]).toBe(str);
      });
    } finally {
      if (!stmt.isClosed()) await stmt.close();
    }
  });

  it("insert duplicate records", async () => {
    await db.execute(
      'CREATE TABLE "things" ("name" varchar(20) CONSTRAINT "index_things_on_name" UNIQUE)',
    );
    const stmt = await db.prepare("INSERT INTO things(name) VALUES(?)");
    await stmt.execute("ruby");

    const raised = (async () => stmt.execute("ruby"))();
    await expect(raised).rejects.toThrow(SQLite3.ConstraintException);
    const exception = (await raised.catch((e: unknown) => e)) as Error;
    expect(exception.message).toMatch(
      /(column(s)? .* (is|are) not unique|UNIQUE constraint failed: .*)/,
    );

    await stmt.close();
  });

  it("with error", async () => {
    await db.execute(
      'CREATE TABLE "employees" ("name" varchar(20) NOT NULL CONSTRAINT "index_employees_on_name" UNIQUE)',
    );
    const stmt = await db.prepare("INSERT INTO Employees(name) VALUES(?)");
    await stmt.execute("employee-1");
    try {
      await stmt.execute("employee-1");
    } catch {}
    await stmt.resetBang();
    expect(await stmt.execute("employee-2")).toBeTruthy();
    await stmt.close();
  });

  it("prepare blob", async () => {
    await db.execute("create table foo(text BLOB)");
    const stmt = await db.prepare("insert into foo(text) values (?)");
    await stmt.bindParam(1, new SQLite3.Blob("hello"));
    await stmt.step();
    await stmt.close();
  });

  it("select blob", async () => {
    await db.execute("create table foo(text BLOB)");
    await db.execute("insert into foo(text) values (?)", new SQLite3.Blob("hello"));
    expect(
      new Uint8Array(((await db.execute("select * from foo")) as unknown[][])[0][0] as Uint8Array),
    ).toEqual(new TextEncoder().encode("hello"));
  });

  it("new", async () => {
    expect(stmt).toBeTruthy();
  });

  it("new closed handle", async () => {
    db = new SQLite3.Database(":memory:", { engine });
    await db.close();
    expect(() => SQLite3.Statement.new(db, 'select "foo"')).toThrow(ArgumentError);
  });

  it("closed db behavior", async () => {
    await db.close();
    let result: ReturnType<typeof stmt.execute> | null = null;
    expect(() => {
      result = stmt.execute();
    }).not.toThrow();
    expect(await result).not.toBeNull();
  });

  it("new with remainder", async () => {
    const stmt = await SQLite3.Statement.new(db, "select 'foo';bar");
    expect(stmt.remainder).toBe("bar");
    await stmt.close();
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
    const stmt = await SQLite3.Statement.new(db, "select ?");
    await stmt.bindParam(1, "hello");
    let result: unknown = null;
    await stmt.each((x) => {
      result = x;
    });
    expect(result).toEqual(["hello"]);
    await stmt.close();
  });

  it("bind param int", async () => {
    const stmt = await SQLite3.Statement.new(db, "select ?");
    await stmt.bindParam(1, 10);
    let result: unknown = null;
    await stmt.each((x) => {
      result = x;
    });
    expect(result).toEqual([10]);
    await stmt.close();
  });

  it("bind nil", async () => {
    const stmt = await SQLite3.Statement.new(db, "select ?");
    await stmt.bindParam(1, null);
    let result: unknown = null;
    await stmt.each((x) => {
      result = x;
    });
    expect(result).toEqual([null]);
    await stmt.close();
  });

  it("bind 64", async () => {
    const stmt = await SQLite3.Statement.new(db, "select ?");
    await stmt.bindParam(1, 2 ** 31);
    let result: unknown = null;
    await stmt.each((x) => {
      result = x;
    });
    expect(result).toEqual([2 ** 31]);
    await stmt.close();
  });

  it("bind double", async () => {
    const stmt = await SQLite3.Statement.new(db, "select ?");
    await stmt.bindParam(1, 2.2);
    let result: unknown = null;
    await stmt.each((x) => {
      result = x;
    });
    expect(result).toEqual([2.2]);
    await stmt.close();
  });

  it("named bind", async () => {
    const stmt = await SQLite3.Statement.new(db, "select :foo");
    await stmt.bindParam(":foo", "hello");
    let result: unknown = null;
    await stmt.each((x) => {
      result = x;
    });
    expect(result).toEqual(["hello"]);
    await stmt.close();
  });

  it("named bind no colon", async () => {
    const stmt = await SQLite3.Statement.new(db, "select :foo");
    await stmt.bindParam("foo", "hello");
    let result: unknown = null;
    await stmt.each((x) => {
      result = x;
    });
    expect(result).toEqual(["hello"]);
    await stmt.close();
  });

  it("named bind symbol", async () => {
    const stmt = await SQLite3.Statement.new(db, "select :foo");
    await stmt.bindParam("foo", "hello");
    let result: unknown = null;
    await stmt.each((x) => {
      result = x;
    });
    expect(result).toEqual(["hello"]);
    await stmt.close();
  });

  it("named bind not found", async () => {
    const s = await SQLite3.Statement.new(db, "select :foo");
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

  it("bind blob", async () => {
    await db.execute("create table foo(text BLOB)");
    const stmt = await SQLite3.Statement.new(db, "insert into foo(text) values (?)");
    await stmt.bindParam(1, new TextEncoder().encode("hello"));
    await stmt.execute();
    await stmt.close();
    await db.prepare("select * from foo", async (v) => {
      expect(new Uint8Array((await v.first())![0] as Uint8Array)).toEqual(
        new TextEncoder().encode("hello"),
      );
      expect(await v.types()).toEqual(["blob"]);
    });
  });
});
