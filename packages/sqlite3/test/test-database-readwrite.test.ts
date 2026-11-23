import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { File, RuntimeError } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../lib/index.js";
import { engine } from "../lib/engine/better-sqlite3.js";

describe("TestDatabaseReadwrite", () => {
  let db: InstanceType<typeof SQLite3.Database>;

  beforeEach(async () => {
    if (File.isExist("test-readwrite.db")) File.delete("test-readwrite.db");
    db = new SQLite3.Database("test-readwrite.db", { engine });
    await db.execute("CREATE TABLE foos (id integer)");
    await db.close();
  });

  afterEach(async () => {
    if (!db.isClosed()) await db.close();
    if (File.isExist("test-readwrite.db")) File.delete("test-readwrite.db");
  });

  it("open readwrite database", () => {
    db = new SQLite3.Database("test-readwrite.db", { engine, readwrite: true });
    expect(db.isReadonly()).toBeFalsy();
  });

  it("open readwrite readonly database", () => {
    expect(() => {
      db = new SQLite3.Database("test-readwrite.db", { engine, readwrite: true, readonly: true });
    }).toThrow(RuntimeError);
  });

  it("open readwrite not exists database", () => {
    File.delete("test-readwrite.db");
    expect(() => {
      db = new SQLite3.Database("test-readwrite.db", { engine, readonly: true });
    }).toThrow(SQLite3.CantOpenException);
  });

  it("insert readwrite database", async () => {
    db = new SQLite3.Database("test-readwrite.db", { engine, readwrite: true });
    await db.execute("INSERT INTO foos (id) VALUES (12)");
    expect(await db.changes()).toBe(1);
  });
});
