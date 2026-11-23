import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Pathname, Tempfile, TypeError } from "@blazetrails/ruby-compat";
import type {} from "@blazetrails/vitest-matchers";
import { SQLite3 } from "../lib/index.js";
import { engine } from "../lib/engine/better-sqlite3.js";
import { engine as quirkEngine } from "../lib/engine/node-sqlite.js";

class FakeExtensionSpecifier {
  static toPath(): string {
    return "/path/to/extension";
  }
}

type MockedDatabase = InstanceType<typeof SQLite3.Database> & {
  loadExtensionInternalPath: string[];
  enableLoadExtensionCalled: number;
  enableLoadExtensionArg: boolean[];
};

function mockDatabaseLoadExtensionInternal(db: InstanceType<typeof SQLite3.Database>) {
  const mocked = db as MockedDatabase;
  mocked.loadExtensionInternalPath = [];
  Object.assign(db, {
    loadExtensionInternal(path: string) {
      mocked.loadExtensionInternalPath.push(path);
    },
  });
  return mocked;
}

describe("TestDatabase", () => {
  let db: InstanceType<typeof SQLite3.Database>;

  beforeEach(() => {
    db = new SQLite3.Database(":memory:", { engine });
  });

  afterEach(async () => {
    if (!db.isClosed()) await db.close();
  });

  it("segv", async () => {
    expect(() => new SQLite3.Database(1 as unknown as string, { engine })).toThrow();
  });

  it("execute batch2", async () => {
    await db.close();
    db = new SQLite3.Database(":memory:", { engine: quirkEngine });
    db.resultsAsHash = true;
    let returnValue = await db.executeBatch2(`
        CREATE TABLE items (id integer PRIMARY KEY AUTOINCREMENT, name string);
        INSERT INTO items (name) VALUES ("foo");
        INSERT INTO items (name) VALUES ("bar");
        SELECT * FROM items;
      `);
    expect(returnValue).toEqual([
      { id: "1", name: "foo" },
      { id: "2", name: "bar" },
    ]);

    returnValue = await db.executeBatch2("SELECT * FROM items;", (result) => {
      const row = result as Record<string, unknown>;
      row["id"] = Number.parseInt(row["id"] as string, 10);
      return row;
    });
    expect(returnValue).toEqual([
      { id: 1, name: "foo" },
      { id: 2, name: "bar" },
    ]);

    returnValue = await db.executeBatch2('INSERT INTO items (name) VALUES ("oof")');
    expect(returnValue).toBeEmpty();

    returnValue = await db.executeBatch2(
      `CREATE TABLE employees (id integer PRIMARY KEY AUTOINCREMENT, name string, age integer(3));
        INSERT INTO employees (age) VALUES (30);
        INSERT INTO employees (age) VALUES (40);
        INSERT INTO employees (age) VALUES (20);
        SELECT age FROM employees;`,
      (result) => {
        const row = result as Record<string, unknown>;
        row["age"] = Number.parseInt(row["age"] as string, 10);
        return row;
      },
    );
    expect(returnValue).toEqual([{ age: 30 }, { age: 40 }, { age: 20 }]);

    returnValue = await db.executeBatch2("SELECT name FROM employees");
    expect(returnValue).toEqual([{ name: null }, { name: null }, { name: null }]);

    db.resultsAsHash = false;
    returnValue = await db.executeBatch2(
      `CREATE TABLE managers (id integer PRIMARY KEY AUTOINCREMENT, age integer(3));
        INSERT INTO managers (age) VALUES (50);
        INSERT INTO managers (age) VALUES (60);
        SELECT id, age from managers;`,
      (result) => {
        result = (result as string[]).map((res) => Number.parseInt(res, 10));
        return result;
      },
    );
    expect(returnValue).toEqual([
      [1, 50],
      [2, 60],
    ]);

    await expect(
      (async () => db.executeBatch2('INSERT INTO items (names) VALUES ("bazz")'))(),
    ).rejects.toThrow(SQLite3.Exception);
  });

  it("strict mode", async () => {
    let db = new SQLite3.Database(":memory:", { engine: quirkEngine });
    await db.execute("create table numbers (val int);");
    await db.execute('create index index_numbers_nope ON numbers ("nope");');
    await db.close();

    db = new SQLite3.Database(":memory:", { engine: quirkEngine, strict: true });
    await db.execute("create table numbers (val int);");
    const raised = db.execute('create index index_numbers_nope ON numbers ("nope");');
    await expect(raised).rejects.toThrow(SQLite3.SQLException);
    const error = (await raised.catch((e: unknown) => e)) as Error;
    expect(error.message).toMatch(/no such column: "?nope"?/);
    await db.close();
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
    let stmt: Awaited<ReturnType<typeof SQLite3.Statement.new>> | undefined;
    try {
      stmt = await db.prepare("select 'hello world'");
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
    const s = await db.prepare("select 'foo'");
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

  it("load extension with an extension descriptor", () => {
    const mocked = mockDatabaseLoadExtensionInternal(db);

    db.loadExtension(new Pathname("/path/to/ext2"));
    expect(mocked.loadExtensionInternalPath).toEqual(["/path/to/ext2"]);

    mocked.loadExtensionInternalPath.length = 0;

    db.loadExtension(FakeExtensionSpecifier);
    expect(mocked.loadExtensionInternalPath).toEqual(["/path/to/extension"]);
  });

  it("load extension error with nonexistent path", () => {
    db.enableLoadExtension(true);

    expect(() => db.loadExtension("/nonexistent/path")).toThrow(SQLite3.Exception);
    expect(() => db.loadExtension(new Pathname("nonexistent"))).toThrow(SQLite3.Exception);
  });

  it("load extension error with invalid argument", () => {
    db.enableLoadExtension(true);

    expect(() => db.loadExtension(1)).toThrow(TypeError);
    expect(() => db.loadExtension({ a: 1 })).toThrow(TypeError);
    expect(() => db.loadExtension([])).toThrow(TypeError);
    expect(() => db.loadExtension(new Object())).toThrow(TypeError);
  });

  it("initialize extensions with extensions calls enable load extension", () => {
    const mocked = mockDatabaseLoadExtensionInternal(db);
    const resetTest = () => {
      mocked.enableLoadExtensionCalled = 0;
      mocked.enableLoadExtensionArg = [];
    };
    Object.assign(db, {
      enableLoadExtension(val: boolean) {
        mocked.enableLoadExtensionCalled += 1;
        mocked.enableLoadExtensionArg.push(val);
      },
    });

    resetTest();
    db.initializeExtensions(null);
    expect(mocked.enableLoadExtensionCalled).toBe(0);

    resetTest();
    db.initializeExtensions([]);
    expect(mocked.enableLoadExtensionCalled).toBe(0);

    resetTest();
    db.initializeExtensions(["/path/to/extension"]);
    expect(mocked.enableLoadExtensionCalled).toBe(2);
    expect(mocked.enableLoadExtensionArg).toEqual([true, false]);

    resetTest();
    db.initializeExtensions([FakeExtensionSpecifier]);
    expect(mocked.enableLoadExtensionCalled).toBe(2);
    expect(mocked.enableLoadExtensionArg).toEqual([true, false]);
  });

  it("initialize extensions object is an extension specifier", () => {
    const mocked = mockDatabaseLoadExtensionInternal(db);

    db.initializeExtensions([new Pathname("/path/to/extension")]);
    expect(mocked.loadExtensionInternalPath).toEqual(["/path/to/extension"]);

    mocked.loadExtensionInternalPath.length = 0;

    db.initializeExtensions([FakeExtensionSpecifier]);
    expect(mocked.loadExtensionInternalPath).toEqual(["/path/to/extension"]);
  });

  it("initialize extensions object not an extension specifier", () => {
    const mocked = mockDatabaseLoadExtensionInternal(db);

    db.initializeExtensions(["/path/to/extension"]);
    expect(mocked.loadExtensionInternalPath).toEqual(["/path/to/extension"]);

    expect(() => db.initializeExtensions([class {}])).toThrow(TypeError);

    expect(() => db.initializeExtensions(FakeExtensionSpecifier)).toThrow(TypeError);
  });

  it("initialize with extensions calls initialize extensions", () => {
    class Klass extends SQLite3.Database {
      declare initializeExtensionsCalled?: boolean;
      declare initializeExtensionsArg?: unknown;

      override initializeExtensions(extensions: unknown): void {
        this.initializeExtensionsCalled = true;
        this.initializeExtensionsArg = extensions;
      }
    }

    let k = new Klass(":memory:", { engine });
    expect(k.initializeExtensionsCalled).toBeTruthy();
    expect(k.initializeExtensionsArg).toBeNull();

    k = new Klass(":memory:", { engine, extensions: [] });
    expect(k.initializeExtensionsCalled).toBeTruthy();
    expect(k.initializeExtensionsArg).toBeEmpty();

    k = new Klass(":memory:", {
      engine,
      extensions: ["path/to/ext1", "path/to/ext2", FakeExtensionSpecifier],
    });
    expect(k.initializeExtensionsCalled).toBeTruthy();
    expect(k.initializeExtensionsArg).toEqual([
      "path/to/ext1",
      "path/to/ext2",
      FakeExtensionSpecifier,
    ]);
  });

  it("transaction returns true without block", async () => {
    expect(await db.transaction()).toBeTruthy();
  });

  it("transaction returns block result", async () => {
    const result = await db.transaction(null, () => "foo");
    expect(result).toBe("foo");
  });

  it("new yields self", () => {
    let thing: unknown = null;
    new SQLite3.Database(":memory:", { engine }, null, (db) => {
      thing = db;
    });
    expect(thing).toBeInstanceOf(SQLite3.Database);
  });

  it("block closes self", () => {
    let thing: InstanceType<typeof SQLite3.Database> | null = null;
    new SQLite3.Database(":memory:", { engine }, null, (db) => {
      thing = db;
      expect(thing.isClosed()).toBeFalsy();
    });
    expect(thing!.isClosed()).toBeTruthy();
  });

  it("block closes self even raised", () => {
    let thing: InstanceType<typeof SQLite3.Database> | null = null;
    try {
      new SQLite3.Database(":memory:", { engine }, null, (db) => {
        thing = db;
        throw new Error();
      });
    } catch {}
    expect(thing!.isClosed()).toBeTruthy();
  });

  it("default transaction mode", async () => {
    const tf = Tempfile.new("database_default_transaction_mode");
    try {
      const setup = new SQLite3.Database(tf.path()!, { engine });
      await setup.execute("create table foo (score int)");
      await setup.execute("insert into foo values (?)", 1);
      await setup.close();

      const testCases = [
        { mode: null, read: true, write: true },
        { mode: "deferred", read: true, write: true },
        { mode: "immediate", read: true, write: false },
        { mode: "exclusive", read: false, write: false },
      ];

      for (const item of testCases) {
        let db: InstanceType<typeof SQLite3.Database> | null = null;
        let db2: InstanceType<typeof SQLite3.Database> | null = null;
        try {
          db = new SQLite3.Database(tf.path()!, { engine, defaultTransactionMode: item.mode });
          db2 = new SQLite3.Database(tf.path()!, { engine });
          await db.transaction(null, async () => {
            const sqlForReadTest = "select * from foo";
            if (item.read) {
              await expect(db2!.execute(sqlForReadTest)).resolves.not.toThrow();
            } else {
              await expect(db2!.execute(sqlForReadTest)).rejects.toThrow(SQLite3.BusyException);
            }

            const sqlForWriteTest = "insert into foo values (2)";
            if (item.write) {
              await expect(db2!.execute(sqlForWriteTest)).resolves.not.toThrow();
            } else {
              await expect(db2!.execute(sqlForWriteTest)).rejects.toThrow(SQLite3.BusyException);
            }
          });
        } finally {
          if (db && !db.isClosed()) await db.close();
          if (db2 && !db2.isClosed()) await db2.close();
        }
      }
    } finally {
      tf.unlink();
    }
  });
});
