import { SQLite3 } from "../lib/index.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Exception } from "../lib/errors.js";
import { engine } from "../lib/engine/better-sqlite3.js";
import { Encoding } from "@blazetrails/ruby-compat";

describe("TestPragmas", () => {
  const BIGENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 0;

  class DatabaseTracker extends SQLite3.Database {
    testStatements: string[] = [];

    override execute(sql: string, bindVars: unknown = [], block?: (row: unknown) => unknown) {
      this.testStatements.push(sql);
      return super.execute(sql, bindVars, block);
    }
  }

  let db: DatabaseTracker;

  beforeEach(() => {
    db = new DatabaseTracker(":memory:", { engine });
  });

  afterEach(async () => {
    await db.close();
  });

  it("temp store mode", async () => {
    await db.setTempStore("memory");
    expect(await db.tempStore()).toBe(2);
    await db.setTempStore(1);
    expect(await db.tempStore()).toBe(1);
  });

  it("encoding", async () => {
    await db.setEncoding("utf-16le");
    expect(await db.encoding()).toBe(Encoding.find("utf-16le"));
  });

  it("pragma errors", async () => {
    await expect(async () => db.setEnumPragma("foo", "bar", [])).rejects.toThrow(Exception);
    await expect(async () => db.setBooleanPragma("read_uncommitted", "foo")).rejects.toThrow(
      Exception,
    );
    await expect(async () => db.setBooleanPragma("read_uncommitted", 42)).rejects.toThrow(
      Exception,
    );
  });

  it("invalid pragma", async () => {
    await expect(async () => db.setJournalMode(0)).rejects.toThrow(Exception);
  });

  it("get boolean pragma", async () => {
    expect(await db.getBooleanPragma("read_uncommitted")).toBeFalsy();
  });

  it("set boolean pragma", async () => {
    try {
      await db.setBooleanPragma("read_uncommitted", 1);

      expect(await db.getBooleanPragma("read_uncommitted")).toBeTruthy();
    } finally {
      await db.setBooleanPragma("read_uncommitted", 0);
    }
  });

  it("optimize with no args", async () => {
    await db.optimize();

    expect(db.testStatements).toEqual(["PRAGMA optimize"]);
  });

  it("optimize with args", async () => {
    const Optimize = SQLite3.Constants.Optimize;
    await db.optimize(Optimize.DEFAULT);
    await db.optimize(Optimize.ANALYZE_TABLES | Optimize.LIMIT_ANALYZE);
    await db.optimize(Optimize.ANALYZE_TABLES | Optimize.DEBUG);
    await db.optimize(Optimize.DEFAULT | Optimize.CHECK_ALL_TABLES);

    expect(db.testStatements).toEqual([
      "PRAGMA optimize=18",
      "PRAGMA optimize=18",
      "PRAGMA optimize=3",
      "PRAGMA optimize=65554",
    ]);
  });

  it("encoding uppercase", async () => {
    expect(await db.encoding()).toBe(Encoding.UTF_8);

    await db.setEncoding("UTF-16");
    const native = Encoding.find(BIGENDIAN ? "UTF-16BE" : "UTF-16LE");
    expect(await db.encoding()).toBe(native);

    await db.setEncoding("UTF-16LE");
    expect(await db.encoding()).toBe(Encoding.find("UTF-16LE"));

    await db.setEncoding("UTF-16BE");
    expect(await db.encoding()).toBe(Encoding.find("UTF-16BE"));

    await db.setEncoding("UTF-8");
    expect(await db.encoding()).toBe(Encoding.UTF_8);
  });

  it("encoding lowercase", async () => {
    expect(await db.encoding()).toBe(Encoding.UTF_8);

    await db.setEncoding("utf-16");
    const native = Encoding.find(BIGENDIAN ? "UTF-16BE" : "UTF-16LE");
    expect(await db.encoding()).toBe(native);

    await db.setEncoding("utf-16le");
    expect(await db.encoding()).toBe(Encoding.find("UTF-16LE"));

    await db.setEncoding("utf-16be");
    expect(await db.encoding()).toBe(Encoding.find("UTF-16BE"));

    await db.setEncoding("utf-8");
    expect(await db.encoding()).toBe(Encoding.UTF_8);
  });

  it("encoding objects", async () => {
    expect(await db.encoding()).toBe(Encoding.UTF_8);

    await db.setEncoding(Encoding.find("UTF-16")!);
    const native = Encoding.find(BIGENDIAN ? "UTF-16BE" : "UTF-16LE");
    expect(await db.encoding()).toBe(native);

    await db.setEncoding(Encoding.find("UTF-16LE")!);
    expect(await db.encoding()).toBe(Encoding.find("UTF-16LE"));

    await db.setEncoding(Encoding.find("UTF-16BE")!);
    expect(await db.encoding()).toBe(Encoding.find("UTF-16BE"));

    await db.setEncoding(Encoding.UTF_8);
    expect(await db.encoding()).toBe(Encoding.UTF_8);
  });
});
