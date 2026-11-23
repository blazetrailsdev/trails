import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { File } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../lib/index.js";
import { engine } from "../lib/engine/better-sqlite3.js";

describe("TestDatabaseReadonly", () => {
  let db: InstanceType<typeof SQLite3.Database>;

  beforeEach(async () => {
    if (File.isExist("test-readonly.db")) File.delete("test-readonly.db");
    db = new SQLite3.Database("test-readonly.db", { engine });
    await db.execute("CREATE TABLE foos (id integer)");
    await db.close();
  });

  afterEach(async () => {
    if (!db.isClosed()) await db.close();
    if (File.isExist("test-readonly.db")) File.delete("test-readonly.db");
  });

  it("open readonly database", () => {
    db = new SQLite3.Database("test-readonly.db", { engine, readonly: true });
    expect(db.isReadonly()).toBeTruthy();
  });

  it("open readonly not exists database", () => {
    File.delete("test-readonly.db");
    expect(() => {
      db = new SQLite3.Database("test-readonly.db", { engine, readonly: true });
    }).toThrow(SQLite3.CantOpenException);
  });

  it("insert readonly database", async () => {
    db = new SQLite3.Database("test-readonly.db", { engine, readonly: true });
    await expect(db.execute("INSERT INTO foos (id) VALUES (12)")).rejects.toThrow(
      SQLite3.ReadOnlyException,
    );
  });
});
