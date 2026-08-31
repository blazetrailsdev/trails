import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BetterSQLite3Adapter } from "./better-sqlite3-adapter.js";
import { StatementInvalid } from "../errors.js";

describe("SQLite3Adapter#check_all_foreign_keys_valid!", () => {
  let adapter: BetterSQLite3Adapter;

  beforeEach(async () => {
    adapter = new BetterSQLite3Adapter({ database: ":memory:" });
    await adapter.execute("PRAGMA foreign_keys = OFF");
    await adapter.executeMutation("CREATE TABLE parents (id integer PRIMARY KEY)");
    await adapter.executeMutation(
      "CREATE TABLE kids (id integer PRIMARY KEY, parent_id integer REFERENCES parents(id))",
    );
  });

  afterEach(async () => {
    await adapter.dropTable("kids", "parents");
    await adapter.close();
  });

  it("passes when every foreign key resolves", async () => {
    await adapter.executeMutation("INSERT INTO parents (id) VALUES (1)");
    await adapter.executeMutation("INSERT INTO kids (id, parent_id) VALUES (1, 1)");

    await expect(adapter.checkAllForeignKeysValidBang()).resolves.toBeUndefined();
  });

  it("raises StatementInvalid naming the offending table", async () => {
    await adapter.executeMutation("INSERT INTO kids (id, parent_id) VALUES (1, 999)");

    await expect(adapter.checkAllForeignKeysValidBang()).rejects.toThrow(StatementInvalid);
    await expect(adapter.checkAllForeignKeysValidBang()).rejects.toThrow(
      "Foreign key violations found: kids",
    );
  });

  it("raises with the connection pool that produced the error", async () => {
    await adapter.executeMutation("INSERT INTO kids (id, parent_id) VALUES (1, 999)");

    const error = await adapter.checkAllForeignKeysValidBang().then(
      () => null,
      (e: StatementInvalid) => e,
    );
    expect(error!.connectionPool).toBe(adapter.pool);
  });
});
