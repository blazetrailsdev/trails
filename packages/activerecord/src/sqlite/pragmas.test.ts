import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SyncSqliteConnection } from "../sqlite-adapter.js";
import { betterSqlite3Driver } from "./better-sqlite3.js";
import { Exception } from "./errors.js";
import { Pragmas } from "./pragmas.js";

describe("SQLite3::TestPragmas", () => {
  let db: SyncSqliteConnection & { testStatements: string[] };

  beforeEach(() => {
    const conn = betterSqlite3Driver.openSync!({ database: ":memory:" });
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
    expect(await Pragmas.getBooleanPragma.call(db, "read_uncommitted")).toBe(false);
  });

  it("set boolean pragma", async () => {
    try {
      Pragmas.setBooleanPragma.call(db, "read_uncommitted", 1);

      expect(await Pragmas.getBooleanPragma.call(db, "read_uncommitted")).toBe(true);
    } finally {
      Pragmas.setBooleanPragma.call(db, "read_uncommitted", 0);
    }
  });

  it("optimize with no args", () => {
    Pragmas.optimize.call(db);

    expect(db.testStatements).toEqual(["PRAGMA optimize"]);
  });
});
