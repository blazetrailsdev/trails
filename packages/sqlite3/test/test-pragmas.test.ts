import { SQLite3 } from "../lib/index.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Exception } from "../lib/errors.js";
import { Pragmas } from "../lib/pragmas.js";
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
    await Pragmas.setTempStore.call(db, "memory");
    expect(await Pragmas.tempStore.call(db)).toBe(2);
    await Pragmas.setTempStore.call(db, 1);
    expect(await Pragmas.tempStore.call(db)).toBe(1);
  });

  it("encoding", async () => {
    const database = new SQLite3.Database(":memory:", { engine });
    try {
      await database.setEncoding("utf-16le");
      expect(await database.encoding()).toBe(Encoding.find("utf-16le"));
    } finally {
      await database.close();
    }
  });

  it("pragma errors", async () => {
    await expect(async () => Pragmas.setEnumPragma.call(db, "foo", "bar", [])).rejects.toThrow(
      Exception,
    );
    await expect(async () =>
      Pragmas.setBooleanPragma.call(db, "read_uncommitted", "foo"),
    ).rejects.toThrow(Exception);
    await expect(async () =>
      Pragmas.setBooleanPragma.call(db, "read_uncommitted", 42),
    ).rejects.toThrow(Exception);
  });

  it("invalid pragma", async () => {
    await expect(async () => Pragmas.setJournalMode.call(db, 0)).rejects.toThrow(Exception);
  });

  it("get boolean pragma", async () => {
    expect(await Pragmas.getBooleanPragma.call(db, "read_uncommitted")).toBeFalsy();
  });

  it("set boolean pragma", async () => {
    try {
      await Pragmas.setBooleanPragma.call(db, "read_uncommitted", 1);

      expect(await Pragmas.getBooleanPragma.call(db, "read_uncommitted")).toBeTruthy();
    } finally {
      await Pragmas.setBooleanPragma.call(db, "read_uncommitted", 0);
    }
  });

  it("optimize with no args", async () => {
    await Pragmas.optimize.call(db);

    expect(db.testStatements).toEqual(["PRAGMA optimize"]);
  });

  it("optimize with args", async () => {
    const Optimize = SQLite3.Constants.Optimize;
    await Pragmas.optimize.call(db, Optimize.DEFAULT);
    await Pragmas.optimize.call(db, Optimize.ANALYZE_TABLES | Optimize.LIMIT_ANALYZE);
    await Pragmas.optimize.call(db, Optimize.ANALYZE_TABLES | Optimize.DEBUG);
    await Pragmas.optimize.call(db, Optimize.DEFAULT | Optimize.CHECK_ALL_TABLES);

    expect(db.testStatements).toEqual([
      "PRAGMA optimize=18",
      "PRAGMA optimize=18",
      "PRAGMA optimize=3",
      "PRAGMA optimize=65554",
    ]);
  });

  it("encoding uppercase", async () => {
    expect(await Pragmas.encoding.call(db)).toBe("UTF-8");

    await Pragmas.setEncoding.call(db, "UTF-16");
    const native = BIGENDIAN ? "UTF-16be" : "UTF-16le";
    expect(await Pragmas.encoding.call(db)).toBe(native);

    await Pragmas.setEncoding.call(db, "UTF-16LE");
    expect(await Pragmas.encoding.call(db)).toBe("UTF-16le");

    await Pragmas.setEncoding.call(db, "UTF-16BE");
    expect(await Pragmas.encoding.call(db)).toBe("UTF-16be");

    await Pragmas.setEncoding.call(db, "UTF-8");
    expect(await Pragmas.encoding.call(db)).toBe("UTF-8");
  });

  it("encoding lowercase", async () => {
    expect(await Pragmas.encoding.call(db)).toBe("UTF-8");

    await Pragmas.setEncoding.call(db, "utf-16");
    const native = BIGENDIAN ? "UTF-16be" : "UTF-16le";
    expect(await Pragmas.encoding.call(db)).toBe(native);

    await Pragmas.setEncoding.call(db, "utf-16le");
    expect(await Pragmas.encoding.call(db)).toBe("UTF-16le");

    await Pragmas.setEncoding.call(db, "utf-16be");
    expect(await Pragmas.encoding.call(db)).toBe("UTF-16be");

    await Pragmas.setEncoding.call(db, "utf-8");
    expect(await Pragmas.encoding.call(db)).toBe("UTF-8");
  });

  it("encoding objects", async () => {
    expect(await Pragmas.encoding.call(db)).toBe("UTF-8");

    await Pragmas.setEncoding.call(db, "UTF-16");
    const native = BIGENDIAN ? "UTF-16be" : "UTF-16le";
    expect(await Pragmas.encoding.call(db)).toBe(native);

    await Pragmas.setEncoding.call(db, "UTF-16LE");
    expect(await Pragmas.encoding.call(db)).toBe("UTF-16le");

    await Pragmas.setEncoding.call(db, "UTF-16BE");
    expect(await Pragmas.encoding.call(db)).toBe("UTF-16be");

    await Pragmas.setEncoding.call(db, "UTF-8");
    expect(await Pragmas.encoding.call(db)).toBe("UTF-8");
  });
});
