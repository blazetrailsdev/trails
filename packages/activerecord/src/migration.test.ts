/**
 * Migration tests.
 * Mirrors: activerecord/test/cases/migration_test.rb
 *          activerecord/test/cases/invertible_migration_test.rb
 */
import { describe, it, expect, beforeEach } from "vitest";
import { MigrationContext } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

function freshContext(): { adapter: DatabaseAdapter; ctx: MigrationContext } {
  const adapter = createTestAdapter();
  const ctx = new MigrationContext(adapter);
  return { adapter, ctx };
}

// ==========================================================================
// MigrationTest
// ==========================================================================

describe("MigrationTest", () => {
  it("create table", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("users", {}, (t) => {
      t.string("name");
      t.integer("age");
    });
    expect(ctx.tableExists("users")).toBe(true);
  });

  it("create table has id column by default", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("products", {}, (t) => {
      t.string("name");
    });
    expect(ctx.tableExists("products")).toBe(true);
    expect(ctx.columnExists("products", "id")).toBe(true);
    expect(ctx.columnExists("products", "name")).toBe(true);
  });

  it("create table with force: true drops and recreates", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("things", {}, (t) => { t.string("color"); });
    expect(ctx.tableExists("things")).toBe(true);

    await ctx.createTable("things", { force: true }, (t) => {
      t.string("shape");
    });
    expect(ctx.tableExists("things")).toBe(true);
    // After force recreate, columns reset
    expect(ctx.columnExists("things", "shape")).toBe(true);
  });

  it("drop table", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("posts", {});
    expect(ctx.tableExists("posts")).toBe(true);

    await ctx.dropTable("posts");
    expect(ctx.tableExists("posts")).toBe(false);
  });

  it("add column", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("users", {}, (t) => { t.string("name"); });

    await ctx.addColumn("users", "email", "string");
    expect(ctx.columnExists("users", "email")).toBe(true);
  });

  it("remove column", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("users", {}, (t) => {
      t.string("name");
      t.string("email");
    });

    await ctx.removeColumn("users", "email");
    expect(ctx.columnExists("users", "email")).toBe(false);
    expect(ctx.columnExists("users", "name")).toBe(true);
  });

  it("rename column", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("users", {}, (t) => { t.string("old_name"); });

    await ctx.renameColumn("users", "old_name", "new_name");
    expect(ctx.columnExists("users", "old_name")).toBe(false);
    expect(ctx.columnExists("users", "new_name")).toBe(true);
  });

  it("add index", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("users", {}, (t) => { t.string("email"); });

    await ctx.addIndex("users", "email", { unique: true });
    expect(ctx.indexExists("users", "email")).toBe(true);
  });

  it("add composite index", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("users", {}, (t) => {
      t.string("first_name");
      t.string("last_name");
    });

    await ctx.addIndex("users", ["first_name", "last_name"]);
    expect(ctx.indexExists("users", "first_name")).toBe(true);
    expect(ctx.indexExists("users", "last_name")).toBe(true);
  });

  it("remove index by column name", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("users", {}, (t) => { t.string("email"); });
    await ctx.addIndex("users", "email");
    expect(ctx.indexExists("users", "email")).toBe(true);

    await ctx.removeIndex("users", { column: "email" });
    expect(ctx.indexExists("users", "email")).toBe(false);
  });

  it("remove index by name", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("users", {}, (t) => { t.string("email"); });
    await ctx.addIndex("users", "email", { name: "idx_users_email" });

    await ctx.removeIndex("users", { name: "idx_users_email" });
    expect(ctx.indexExists("users", "email")).toBe(false);
  });

  it("rename table", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("old_name", {}, (t) => { t.string("value"); });
    expect(ctx.tableExists("old_name")).toBe(true);

    await ctx.renameTable("old_name", "new_name");
    expect(ctx.tableExists("old_name")).toBe(false);
    expect(ctx.tableExists("new_name")).toBe(true);
    expect(ctx.columnExists("new_name", "value")).toBe(true);
  });

  it("tableExists returns false for non-existent table", async () => {
    const { ctx } = freshContext();
    expect(ctx.tableExists("nonexistent")).toBe(false);
  });

  it("columnExists returns false for non-existent column", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("users", {}, (t) => { t.string("name"); });
    expect(ctx.columnExists("users", "nonexistent")).toBe(false);
  });

  it("reversible calls up block", async () => {
    const { ctx } = freshContext();
    let upCalled = false;
    let downCalled = false;

    await ctx.reversible((dir) => {
      dir.up(async () => { upCalled = true; });
      dir.down(async () => { downCalled = true; });
    });

    expect(upCalled).toBe(true);
    expect(downCalled).toBe(false);
  });

  it("create table persists data via adapter", async () => {
    const { adapter, ctx } = freshContext();
    await ctx.createTable("items", {}, (t) => {
      t.string("label");
    });

    // Insert and query through the adapter
    await adapter.executeMutation(`INSERT INTO "items" ("label") VALUES ('hello')`);
    const rows = await adapter.execute(`SELECT * FROM "items"`);
    expect(rows.length).toBe(1);
    expect(rows[0].label).toBe("hello");
  });

  it("remove multiple columns", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("users", {}, (t) => {
      t.string("name");
      t.string("email");
      t.integer("age");
    });

    await ctx.removeColumn("users", "email", "age");
    expect(ctx.columnExists("users", "email")).toBe(false);
    expect(ctx.columnExists("users", "age")).toBe(false);
    expect(ctx.columnExists("users", "name")).toBe(true);
  });
});

// ==========================================================================
// InvertibleMigrationTest
// ==========================================================================

describe("InvertibleMigrationTest", () => {
  it("migrate up creates table", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("horses", {}, (t) => {
      t.string("name");
      t.integer("age");
    });
    expect(ctx.tableExists("horses")).toBe(true);
    expect(ctx.columnExists("horses", "name")).toBe(true);
    expect(ctx.columnExists("horses", "age")).toBe(true);
  });

  it("migrate down drops table", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("horses", {}, (t) => { t.string("name"); });
    expect(ctx.tableExists("horses")).toBe(true);

    await ctx.dropTable("horses");
    expect(ctx.tableExists("horses")).toBe(false);
  });

  it("reversible migration executes up block only", async () => {
    const { ctx } = freshContext();
    const log: string[] = [];

    await ctx.reversible((dir) => {
      dir.up(async () => { log.push("up"); });
      dir.down(async () => { log.push("down"); });
    });

    expect(log).toEqual(["up"]);
  });

  it("revert executes the migration function", async () => {
    const { ctx } = freshContext();
    let called = false;
    await ctx.revert(async () => { called = true; });
    expect(called).toBe(true);
  });

  it("can create table without id column", async () => {
    const { ctx } = freshContext();
    await ctx.createTable("join_table", { id: false }, (t) => {
      t.integer("user_id");
      t.integer("tag_id");
    });
    expect(ctx.tableExists("join_table")).toBe(true);
    expect(ctx.columnExists("join_table", "id")).toBe(false);
    expect(ctx.columnExists("join_table", "user_id")).toBe(true);
  });
});
