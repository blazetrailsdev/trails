import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { AbstractSQLite3Adapter } from "./sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "./better-sqlite3-adapter.js";
import { Base } from "../base.js";

describe("SQLite3Adapter addForeignKey under a table name prefix/suffix", () => {
  let adapter: AbstractSQLite3Adapter;

  beforeEach(async () => {
    adapter = new BetterSQLite3Adapter(":memory:");
    Base.tableNamePrefix = "p_";
    Base.tableNameSuffix = "_s";
    await adapter.createTable("p_rockets_s", { force: true }, (t) => {
      t.string("name");
    });
    await adapter.createTable("p_astronauts_s", { force: true }, (t) => {
      t.integer("rocket_id");
      t.string("nickname");
    });
  });

  afterEach(async () => {
    Base.tableNamePrefix = "";
    Base.tableNameSuffix = "";
    await adapter.dropTable("p_astronauts_s", "p_rockets_s", "rockets", { ifExists: true });
    await adapter.close();
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

  it("keeps the foreign key pointing at the prefixed table across a table rebuild", async () => {
    await adapter.addForeignKey("p_astronauts_s", "p_rockets_s", { column: "rocket_id" });

    await adapter.removeColumn("p_astronauts_s", "nickname");

    const foreignKeys = await adapter.foreignKeys("p_astronauts_s");
    expect(foreignKeys.length).toBe(1);
    expect(foreignKeys[0].toTable).toBe("p_rockets_s");
    expect(foreignKeys[0].column).toBe("rocket_id");
  });

  it("re-applies the affixes to an unaffixed toTable across a table rebuild", async () => {
    await adapter.createTable("rockets", { force: true }, (t) => {
      t.string("name");
    });
    // addForeignKey already strips and re-applies the affixes, so the unaffixed
    // to_table only reaches the rebuild via DDL trails did not author.
    await adapter.dropTable("p_astronauts_s");
    await adapter.execute(
      `CREATE TABLE "p_astronauts_s" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, ` +
        `"rocket_id" integer, "nickname" varchar, ` +
        `CONSTRAINT "fk_rockets" FOREIGN KEY ("rocket_id") REFERENCES "rockets" ("id"))`,
    );

    await adapter.removeColumn("p_astronauts_s", "nickname");

    // Rails' alter_table caller strips the affixes off the reflected to_table and
    // routes back through definition.foreign_key, which re-applies them
    // (sqlite3_adapter.rb:573-575). strip_table_name_prefix_and_suffix leaves an
    // unaffixed name alone, so the rebuild retargets "rockets" at "p_rockets_s".
    const foreignKeys = await adapter.foreignKeys("p_astronauts_s");
    expect(foreignKeys.length).toBe(1);
    expect(foreignKeys[0].toTable).toBe("p_rockets_s");
  });
});
