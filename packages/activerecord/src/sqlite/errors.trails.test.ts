import { describe, it, expect } from "vitest";
import {
  BusyException,
  ConstraintException,
  Exception,
  NotADatabaseException,
  ReadOnlyException,
  SQLException,
  rbSqlite3Raise,
  rbSqlite3RaiseWithSql,
  status2klass,
} from "./errors.js";
import { betterSqlite3Driver } from "./better-sqlite3.js";

const raised = (fn: () => never): unknown => {
  try {
    fn();
  } catch (e) {
    return e;
  }
};

describe("status2klass", () => {
  it("maps OK to nil and each primary code to its gem class", () => {
    expect(status2klass(0)).toBeNull();
    expect(status2klass(1)).toBe(SQLException);
    expect(status2klass(5)).toBe(BusyException);
    expect(status2klass(8)).toBe(ReadOnlyException);
    expect(status2klass(26)).toBe(NotADatabaseException);
  });

  it("considers only the lower 8 bits of an extended result code", () => {
    expect(status2klass(2067)).toBe(ConstraintException);
  });

  it("falls back to SQLite3::Exception for an unlisted status", () => {
    expect(status2klass(101)).toBe(Exception);
  });

  it("names each class under the SQLite3 namespace", () => {
    expect(ReadOnlyException.name).toBe("SQLite3::ReadOnlyException");
    expect(new BusyException("busy").name).toBe("SQLite3::BusyException");
  });
});

describe("rbSqlite3Raise", () => {
  it("raises the gem class with the primary code and keeps the native error as cause", () => {
    const native = Object.assign(new Error("database is locked"), { errcode: 517 });
    const error = raised(() => rbSqlite3Raise(native)) as BusyException;
    expect(error).toBeInstanceOf(BusyException);
    expect(error.code).toBe(5);
    expect(error.sql).toBeNull();
    expect(error.message).toBe("database is locked");
    expect(error.cause).toBe(native);
  });

  it("rethrows an error that carries no SQLite result code", () => {
    const native = new RangeError("Too few parameter values were provided");
    expect(raised(() => rbSqlite3Raise(native))).toBe(native);
  });
});

describe("rbSqlite3RaiseWithSql", () => {
  it("sets sql, including an empty string, and appends it to the message", () => {
    const native = Object.assign(new Error("no such table: nope"), { code: "SQLITE_ERROR" });
    const error = raised(() => rbSqlite3RaiseWithSql(native, "SELECT * FROM nope")) as Exception;
    expect(error).toBeInstanceOf(SQLException);
    expect(error.sqlOffset).toBe(-1);
    expect(error.message).toBe("no such table: nope:\nSELECT * FROM nope");

    const empty = raised(() => rbSqlite3RaiseWithSql(native, "")) as Exception;
    expect(empty.sql).toBe("");
  });
});

describe("better-sqlite3 driver", () => {
  it("raises SQLite3::ReadOnlyException from a PRAGMA write on a readonly database", async () => {
    const conn = await betterSqlite3Driver.open({ database: ":memory:", readOnly: true });
    try {
      expect(() => conn.pragma("user_version = 1")).toThrow(ReadOnlyException);
    } finally {
      await conn.close();
    }
  });
});
