import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { SQLite3Adapter } from "./sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "./better-sqlite3-adapter.js";
import { Base } from "../base.js";
import { ConnectionPool } from "./abstract/connection-pool.js";
import { PoolConfig } from "./pool-config.js";
import { ConnectionDescriptor } from "./abstract/connection-descriptor.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import type { AbstractAdapter as DatabaseAdapter } from "./abstract-adapter.js";

// Checked out of a real pool, not constructed bare: the alter_table rebuild
// ends in `clear_query_cache`, whose `pool.clear_query_cache`
// (query_cache.rb:232-234) is an unchecked send a NullPool cannot answer.
function newPool(): ConnectionPool {
  return new ConnectionPool(
    new PoolConfig(
      new ConnectionDescriptor("primary"),
      new HashConfig("test", "primary", { adapter: "sqlite3", database: ":memory:" }),
      "writing",
      "default",
      { adapterFactory: () => new BetterSQLite3Adapter(":memory:") as unknown as DatabaseAdapter },
    ),
  );
}

describe("SQLite3Adapter addForeignKey under a table name prefix/suffix", () => {
  let adapter: SQLite3Adapter;
  let pool: ConnectionPool;

  beforeEach(async () => {
    pool = newPool();
    adapter = (await pool.checkout()) as unknown as SQLite3Adapter;
    Base.tableNamePrefix = "p_";
    Base.tableNameSuffix = "_s";
    await adapter.createTable("p_rockets_s", { force: true }, (t) => {
      t.string("name");
    });
    await adapter.createTable("p_astronauts_s", { force: true }, (t) => {
      t.integer("rocket_id");
    });
  });

  afterEach(async () => {
    Base.tableNamePrefix = "";
    Base.tableNameSuffix = "";
    await adapter.dropTable("p_astronauts_s", "p_rockets_s", { ifExists: true });
    await pool.disconnect();
  });

  it("reflects the singly prefixed table", async () => {
    await adapter.addForeignKey("p_astronauts_s", "p_rockets_s", { column: "rocket_id" });

    const foreignKeys = await adapter.foreignKeys("p_astronauts_s");
    expect(foreignKeys.length).toBe(1);
    expect(foreignKeys[0].toTable).toBe("p_rockets_s");
  });

  it("reflects the singly prefixed table for a schema qualified toTable", async () => {
    await adapter.addForeignKey("p_astronauts_s", "main.p_rockets_s", { column: "rocket_id" });

    const foreignKeys = await adapter.foreignKeys("p_astronauts_s");
    expect(foreignKeys.length).toBe(1);
    expect(foreignKeys[0].toTable).toBe("p_rockets_s");
  });
});

describe("SQLite3Adapter alterTable under a table name prefix/suffix", () => {
  let adapter: SQLite3Adapter;
  let pool: ConnectionPool;

  beforeEach(async () => {
    pool = newPool();
    adapter = (await pool.checkout()) as unknown as SQLite3Adapter;
    Base.tableNamePrefix = "p_";
    Base.tableNameSuffix = "_s";
    await adapter.createTable("p_rockets_s", { force: true }, (t) => {
      t.string("name");
    });
    await adapter.createTable("rockets", { force: true }, (t) => {
      t.string("name");
    });
  });

  afterEach(async () => {
    Base.tableNamePrefix = "";
    Base.tableNameSuffix = "";
    await adapter.dropTable("p_astronauts_s", "p_rockets_s", "rockets", { ifExists: true });
    await pool.disconnect();
  });

  it("keeps a rebuilt foreign key pointing at the affixed table", async () => {
    await adapter.createTable("p_astronauts_s", { force: true }, (t) => {
      t.integer("rocket_id");
      t.string("nickname");
    });
    await adapter.addForeignKey("p_astronauts_s", "p_rockets_s", { column: "rocket_id" });

    await adapter.removeColumn("p_astronauts_s", "nickname");

    const foreignKeys = await adapter.foreignKeys("p_astronauts_s");
    expect(foreignKeys.length).toBe(1);
    expect(foreignKeys[0].toTable).toBe("p_rockets_s");
    expect(foreignKeys[0].column).toBe("rocket_id");
    expect(foreignKeys[0].name).toBe("fk_rails_69fb0920bf");
  });

  it("re-applies the affixes to a rebuilt foreign key whose toTable is unaffixed", async () => {
    await adapter.execute(
      `CREATE TABLE "p_astronauts_s" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, ` +
        `"rocket_id" integer, "nickname" varchar, ` +
        `CONSTRAINT "fk_rockets" FOREIGN KEY ("rocket_id") REFERENCES "rockets" ("id"))`,
    );

    await adapter.removeColumn("p_astronauts_s", "nickname");

    const foreignKeys = await adapter.foreignKeys("p_astronauts_s");
    expect(foreignKeys.length).toBe(1);
    expect(foreignKeys[0].toTable).toBe("p_rockets_s");
    expect(foreignKeys[0].name).toBe("fk_rails_69fb0920bf");
  });
});
