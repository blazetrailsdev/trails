import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { File, RuntimeError } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../lib/index.js";
import { engine } from "../lib/engine/better-sqlite3.js";

describe("TestDatabaseFlags", () => {
  let db: InstanceType<typeof SQLite3.Database>;

  beforeEach(async () => {
    if (File.isExist("test-flags.db")) File.delete("test-flags.db");
    db = new SQLite3.Database("test-flags.db", { engine });
    await db.execute("CREATE TABLE foos (id integer)");
    await db.close();
  });

  afterEach(async () => {
    if (!db.isClosed()) await db.close();
    if (File.isExist("test-flags.db")) File.delete("test-flags.db");
  });

  it("open database flags constants", () => {
    const definedToDate = [
      "READONLY",
      "READWRITE",
      "CREATE",
      "DELETEONCLOSE",
      "EXCLUSIVE",
      "MAIN_DB",
      "TEMP_DB",
      "TRANSIENT_DB",
      "MAIN_JOURNAL",
      "TEMP_JOURNAL",
      "SUBJOURNAL",
      "MASTER_JOURNAL",
      "SUPER_JOURNAL",
      "NOMUTEX",
      "FULLMUTEX",
      "AUTOPROXY",
      "SHAREDCACHE",
      "PRIVATECACHE",
      "WAL",
      "URI",
      "MEMORY",
    ];
    expect(Object.keys(SQLite3.Constants.Open).sort()).toEqual(definedToDate.sort());
  });

  it("open database flags conflicts with readonly", () => {
    expect(() => {
      db = new SQLite3.Database("test-flags.db", { engine, flags: 2, readonly: true });
    }).toThrow(RuntimeError);
  });

  it("open database flags conflicts with readwrite", () => {
    expect(() => {
      db = new SQLite3.Database("test-flags.db", { engine, flags: 2, readwrite: true });
    }).toThrow(RuntimeError);
  });

  it("open database readonly flags", () => {
    db = new SQLite3.Database("test-flags.db", {
      engine,
      flags: SQLite3.Constants.Open.READONLY,
    });
    expect(db.isReadonly()).toBeTruthy();
  });

  it("open database readwrite flags", () => {
    db = new SQLite3.Database("test-flags.db", {
      engine,
      flags: SQLite3.Constants.Open.READWRITE,
    });
    expect(db.isReadonly()).toBeFalsy();
  });

  it("open database readonly flags cant open", () => {
    File.delete("test-flags.db");
    expect(() => {
      db = new SQLite3.Database("test-flags.db", {
        engine,
        flags: SQLite3.Constants.Open.READONLY,
      });
    }).toThrow(SQLite3.CantOpenException);
  });

  it("open database readwrite flags cant open", () => {
    File.delete("test-flags.db");
    expect(() => {
      db = new SQLite3.Database("test-flags.db", {
        engine,
        flags: SQLite3.Constants.Open.READWRITE,
      });
    }).toThrow(SQLite3.CantOpenException);
  });

  it("open database misuse flags", () => {
    expect(() => {
      const flags = SQLite3.Constants.Open.READONLY | SQLite3.Constants.Open.READWRITE;
      db = new SQLite3.Database("test-flags.db", { engine, flags: flags });
    }).toThrow(SQLite3.MisuseException);
  });

  it("open database create flags", () => {
    File.delete("test-flags.db");
    const flags = SQLite3.Constants.Open.READWRITE | SQLite3.Constants.Open.CREATE;
    db = new SQLite3.Database("test-flags.db", { engine, flags: flags }, null, (db) => {
      db.executeBatch2("CREATE TABLE foos (id integer)");
      db.executeBatch2("INSERT INTO foos (id) VALUES (12)");
    });
    expect(File.isExist("test-flags.db")).toBeTruthy();
  });

  it("open database exotic flags", async () => {
    const flags = SQLite3.Constants.Open.READWRITE | SQLite3.Constants.Open.CREATE;
    const exoticFlags = SQLite3.Constants.Open.NOMUTEX | SQLite3.Constants.Open.TEMP_DB;
    db = new SQLite3.Database("test-flags.db", { engine, flags: flags | exoticFlags });
    await db.execute("INSERT INTO foos (id) VALUES (12)");
    expect(await db.changes()).toBe(1);
  });
});
