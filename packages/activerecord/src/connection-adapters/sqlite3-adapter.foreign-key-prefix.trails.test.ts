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
    });
  });

  afterEach(async () => {
    Base.tableNamePrefix = "";
    Base.tableNameSuffix = "";
    await adapter.dropTable("p_astronauts_s", "p_rockets_s", { ifExists: true });
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
});

describe("SQLite3Adapter alterTable under a table name prefix/suffix", () => {
  let adapter: AbstractSQLite3Adapter;

  beforeEach(async () => {
    adapter = new BetterSQLite3Adapter(":memory:");
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
    await adapter.close();
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
