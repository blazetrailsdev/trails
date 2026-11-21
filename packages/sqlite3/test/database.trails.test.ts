import { describe, expect, it } from "vitest";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../lib/index.js";
import { engineDatabase } from "./support/engine-database.js";

describe("SQLite3::Database over a fake engine", () => {
  it("new opens READWRITE | CREATE by default, and readonly / readwrite / flags narrow it", () => {
    const modes: number[] = [];
    const engine = (_file: string, mode: number) => (modes.push(mode), engineDatabase());
    const { Open } = SQLite3.Constants;
    expect(new SQLite3.Database(":memory:", { engine }).isReadonly()).toBe(false);
    expect(new SQLite3.Database(":memory:", { engine, readonly: true }).isReadonly()).toBe(true);
    new SQLite3.Database(":memory:", { engine, readwrite: true });
    new SQLite3.Database(":memory:", { engine, flags: Open.READWRITE | Open.SHAREDCACHE });
    expect(modes).toEqual([
      Open.READWRITE | Open.CREATE,
      Open.READONLY,
      Open.READWRITE,
      Open.READWRITE | Open.SHAREDCACHE,
    ]);
    expect(
      () => new SQLite3.Database(":memory:", { engine, readonly: true, readwrite: true }),
    ).toThrow(new RuntimeError("conflicting options: readonly and readwrite"));
    expect(() => new SQLite3.Database(":memory:", { engine, readonly: true, flags: 1 })).toThrow(
      new RuntimeError("conflicting options: flags with readonly and/or readwrite"),
    );
  });

  it("strict disables quirk mode on the engine", () => {
    const loose = engineDatabase();
    const strict = engineDatabase();
    new SQLite3.Database(":memory:", { engine: () => loose });
    new SQLite3.Database(":memory:", { engine: () => strict, strict: true });
    expect(loose.quirkModeDisabled).toBe(false);
    expect(strict.quirkModeDisabled).toBe(true);
  });

  it("executeBatch2 answers the engine's rows, mapped through the block", async () => {
    const db = new SQLite3.Database(":memory:", { engine: () => engineDatabase() });
    db.resultsAsHash = true;
    await db.executeBatch2(
      "CREATE TABLE items (id integer PRIMARY KEY AUTOINCREMENT, name string)",
    );
    await db.executeBatch2("INSERT INTO items (name) VALUES ('foo')");
    expect(db.executeBatch2("SELECT * FROM items")).toEqual([{ id: "1", name: "foo" }]);
    const mapped = db.executeBatch2("SELECT * FROM items", (result) => {
      const row = result as Record<string, unknown>;
      row.id = Number(row.id);
      return row;
    });
    expect(mapped).toEqual([{ id: 1, name: "foo" }]);
    db.resultsAsHash = false;
    expect(db.executeBatch2("SELECT id, name FROM items")).toEqual([["1", "foo"]]);
  });

  it("changes, rollback and getFirstValue run through execute", async () => {
    const db = new SQLite3.Database(":memory:", { engine: () => engineDatabase() });
    await db.execute("CREATE TABLE items (id integer PRIMARY KEY AUTOINCREMENT, number integer)");
    await db.execute("BEGIN");
    await db.execute("INSERT INTO items (number) VALUES (10)");
    expect(db.changes()).toBe(1);
    expect(await db.rollback()).toBe(true);
    expect(await db.getFirstValue("select count(*) from items")).toBe(0);
    db.resultsAsHash = true;
    expect(await db.getFirstValue("select 7 as n")).toBe(7);
  });

  it("Pragmas is included and runs over getFirstValue", async () => {
    const db = new SQLite3.Database(":memory:", { engine: () => engineDatabase() });
    await db.setUserVersion(3);
    expect(await db.userVersion()).toBe(3);
  });

  it("busyHandler hands the block to the engine, and busyHandlerTimeout= retries until the deadline", async () => {
    const fake = engineDatabase();
    const db = new SQLite3.Database(":memory:", { engine: () => fake });
    expect(db.busyHandler(() => true)).toBe(db);
    db.busyHandler();
    expect(fake.handler).toBeNull();
    db.setBusyHandlerTimeout(0);
    expect(fake.handler!(0)).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 2));
    expect(fake.handler!(1)).toBe(false);
  });

  it("quote doubles single quotes", () => {
    expect(SQLite3.Database.quote("it's")).toBe("it''s");
  });
});
