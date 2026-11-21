import { SQLite3 } from "../lib/index.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type SyncSqliteConnection } from "../lib/driver.js";
import { betterSqlite3Driver } from "../lib/better-sqlite3.js";
import { Exception } from "../lib/errors.js";
import { Pragmas } from "../lib/pragmas.js";

const BIGENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 0;

describe("TestPragmas", () => {
  let db: SyncSqliteConnection & { testStatements: string[] };

  beforeEach(async () => {
    const conn = (await betterSqlite3Driver.open({
      database: ":memory:",
    })) as unknown as SyncSqliteConnection;
    const execute = conn.execute.bind(conn);
    db = Object.assign(conn, {
      testStatements: [] as string[],
      execute(sql: string, bindVars: never[] = []) {
        db.testStatements.push(sql);
        return execute(sql, bindVars);
      },
    });
  });

  afterEach(() => {
    db.close();
  });

  it("pragma errors", () => {
    expect(() => Pragmas.setEnumPragma.call(db, "foo", "bar", [])).toThrow(Exception);
    expect(() => Pragmas.setBooleanPragma.call(db, "read_uncommitted", "foo")).toThrow(Exception);
    expect(() => Pragmas.setBooleanPragma.call(db, "read_uncommitted", 42)).toThrow(Exception);
  });

  it("get boolean pragma", async () => {
    expect(await Pragmas.getBooleanPragma.call(db, "read_uncommitted")).toBeFalsy();
  });

  it("set boolean pragma", async () => {
    try {
      Pragmas.setBooleanPragma.call(db, "read_uncommitted", 1);

      expect(await Pragmas.getBooleanPragma.call(db, "read_uncommitted")).toBeTruthy();
    } finally {
      Pragmas.setBooleanPragma.call(db, "read_uncommitted", 0);
    }
  });

  it("optimize with no args", () => {
    Pragmas.optimize.call(db);

    expect(db.testStatements).toEqual(["PRAGMA optimize"]);
  });

  it("optimize with args", () => {
    const Optimize = SQLite3.Constants.Optimize;
    Pragmas.optimize.call(db, Optimize.DEFAULT);
    Pragmas.optimize.call(db, Optimize.ANALYZE_TABLES | Optimize.LIMIT_ANALYZE);
    Pragmas.optimize.call(db, Optimize.ANALYZE_TABLES | Optimize.DEBUG);
    Pragmas.optimize.call(db, Optimize.DEFAULT | Optimize.CHECK_ALL_TABLES);

    expect(db.testStatements).toEqual([
      "PRAGMA optimize=18",
      "PRAGMA optimize=18",
      "PRAGMA optimize=3",
      "PRAGMA optimize=65554",
    ]);
  });

  it("encoding uppercase", async () => {
    expect(await Pragmas.encoding.call(db)).toBe("UTF-8");

    Pragmas.setEncoding.call(db, "UTF-16");
    const native = BIGENDIAN ? "UTF-16be" : "UTF-16le";
    expect(await Pragmas.encoding.call(db)).toBe(native);

    Pragmas.setEncoding.call(db, "UTF-16LE");
    expect(await Pragmas.encoding.call(db)).toBe("UTF-16le");

    Pragmas.setEncoding.call(db, "UTF-16BE");
    expect(await Pragmas.encoding.call(db)).toBe("UTF-16be");

    Pragmas.setEncoding.call(db, "UTF-8");
    expect(await Pragmas.encoding.call(db)).toBe("UTF-8");
  });

  it("encoding lowercase", async () => {
    expect(await Pragmas.encoding.call(db)).toBe("UTF-8");

    Pragmas.setEncoding.call(db, "utf-16");
    const native = BIGENDIAN ? "UTF-16be" : "UTF-16le";
    expect(await Pragmas.encoding.call(db)).toBe(native);

    Pragmas.setEncoding.call(db, "utf-16le");
    expect(await Pragmas.encoding.call(db)).toBe("UTF-16le");

    Pragmas.setEncoding.call(db, "utf-16be");
    expect(await Pragmas.encoding.call(db)).toBe("UTF-16be");

    Pragmas.setEncoding.call(db, "utf-8");
    expect(await Pragmas.encoding.call(db)).toBe("UTF-8");
  });

  it("encoding objects", async () => {
    expect(await Pragmas.encoding.call(db)).toBe("UTF-8");

    Pragmas.setEncoding.call(db, "UTF-16");
    const native = BIGENDIAN ? "UTF-16be" : "UTF-16le";
    expect(await Pragmas.encoding.call(db)).toBe(native);

    Pragmas.setEncoding.call(db, "UTF-16LE");
    expect(await Pragmas.encoding.call(db)).toBe("UTF-16le");

    Pragmas.setEncoding.call(db, "UTF-16BE");
    expect(await Pragmas.encoding.call(db)).toBe("UTF-16be");

    Pragmas.setEncoding.call(db, "UTF-8");
    expect(await Pragmas.encoding.call(db)).toBe("UTF-8");
  });
});
