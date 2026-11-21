import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Pathname, TypeError } from "@blazetrails/ruby-compat";
import type {} from "@blazetrails/vitest-matchers";
import { SQLite3 } from "../lib/index.js";
import { engine } from "../lib/engine/better-sqlite3.js";

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
});
