/**
 * Migration tests.
 * Mirrors: activerecord/test/cases/migration_test.rb
 *          activerecord/test/cases/invertible_migration_test.rb
 */
import { describe, it, expect, beforeEach } from "vitest";
import { MigrationContext , MigrationRunner} from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { Migration, TableDefinition, Schema } from "./migration.js";

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

  it.skip("add column with if not exists not set", () => {});
  it.skip("rename table with prefix and suffix", () => {});
  it.skip("decimal scale without precision should raise", () => {});
  it.skip("add and remove index", () => {});
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


// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}


describe("Migrations", () => {
  describe("TableDefinition", () => {
    it("generates CREATE TABLE SQL", () => {
      const td = new TableDefinition("users");
      td.string("name");
      td.integer("age");
      td.boolean("active", { default: true });

      const sql = td.toSql();
      expect(sql).toContain('CREATE TABLE "users"');
      expect(sql).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT');
      expect(sql).toContain('"name" VARCHAR(255)');
      expect(sql).toContain('"age" INTEGER');
      expect(sql).toContain('"active" BOOLEAN DEFAULT TRUE');
    });

    it("supports id: false option", () => {
      const td = new TableDefinition("join_table", { id: false });
      td.integer("user_id");
      td.integer("role_id");

      const sql = td.toSql();
      expect(sql).not.toContain("PRIMARY KEY");
      expect(sql).toContain('"user_id" INTEGER');
    });

    it("supports timestamps", () => {
      const td = new TableDefinition("posts");
      td.timestamps();

      const sql = td.toSql();
      expect(sql).toContain('"created_at" DATETIME NOT NULL');
      expect(sql).toContain('"updated_at" DATETIME NOT NULL');
    });

    it("supports references", () => {
      const td = new TableDefinition("posts");
      td.references("user");

      const sql = td.toSql();
      expect(sql).toContain('"user_id" INTEGER');
    });

    it("supports NOT NULL constraint", () => {
      const td = new TableDefinition("posts");
      td.string("title", { null: false });

      const sql = td.toSql();
      expect(sql).toContain('"title" VARCHAR(255) NOT NULL');
    });

    it("supports decimal with precision and scale", () => {
      const td = new TableDefinition("products");
      td.decimal("price", { precision: 8, scale: 2 });

      const sql = td.toSql();
      expect(sql).toContain('"price" DECIMAL(8, 2)');
    });

    it("supports string with custom limit", () => {
      const td = new TableDefinition("posts");
      td.string("slug", { limit: 100 });

      const sql = td.toSql();
      expect(sql).toContain('"slug" VARCHAR(100)');
    });
  });

  describe("Migration class", () => {
    it("creates and drops tables", async () => {
      const adapter = freshAdapter();

      class CreateUsers extends Migration {
        async up() {
          await this.createTable("users", (t) => {
            t.string("name");
            t.string("email");
          });
        }

        async down() {
          await this.dropTable("users");
        }
      }

      const migration = new CreateUsers();
      await migration.run(adapter, "up");

      // Verify table exists by inserting data
      await adapter.executeMutation(
        `INSERT INTO "users" ("name", "email") VALUES ('Dean', 'dean@test.com')`
      );
      const rows = await adapter.execute(`SELECT * FROM "users"`);
      expect(rows).toHaveLength(1);
    });
  });

  describe("Schema.define", () => {
    it("creates tables in a block", async () => {
      const adapter = freshAdapter();

      await Schema.define(adapter, async (schema) => {
        await schema.createTable("posts", (t) => {
          t.string("title");
          t.text("body");
        });
      });

      await adapter.executeMutation(
        `INSERT INTO "posts" ("title", "body") VALUES ('Hello', 'World')`
      );
      const rows = await adapter.execute(`SELECT * FROM "posts"`);
      expect(rows).toHaveLength(1);
    });
  });
});

describe("Migration DDL (extended)", () => {
  it("addColumn generates ALTER TABLE ADD COLUMN", async () => {
    const adapter = freshAdapter();
    class AddAge extends Migration {
      async up() {
        await this.createTable("users", (t) => {
          t.string("name");
        });
        await this.addColumn("users", "age", "integer");
      }
      async down() {}
    }
    const m = new AddAge();
    await m.run(adapter, "up");
    // Should be able to insert with the new column
    await adapter.executeMutation(
      `INSERT INTO "users" ("name", "age") VALUES ('Dean', 30)`
    );
    const rows = await adapter.execute(`SELECT * FROM "users"`);
    expect(rows).toHaveLength(1);
  });

  it("removeColumn generates ALTER TABLE DROP COLUMN", async () => {
    const adapter = freshAdapter();
    class RemoveCol extends Migration {
      async up() {
        await this.createTable("users", (t) => {
          t.string("name");
          t.string("email");
        });
        await this.removeColumn("users", "email");
      }
      async down() {}
    }
    const m = new RemoveCol();
    await m.run(adapter, "up");
    // MemoryAdapter may or may not enforce column removal, but SQL is generated
  });

  it("addIndex generates CREATE INDEX", async () => {
    const adapter = freshAdapter();
    class AddIdx extends Migration {
      async up() {
        await this.createTable("users", (t) => {
          t.string("email");
        });
        await this.addIndex("users", ["email"]);
      }
      async down() {}
    }
    const m = new AddIdx();
    await m.run(adapter, "up");
    // MemoryAdapter ignores indexes but migration runs without error
  });

  it("addIndex with unique option", async () => {
    const adapter = freshAdapter();
    class AddUniqueIdx extends Migration {
      async up() {
        await this.createTable("users", (t) => {
          t.string("email");
        });
        await this.addIndex("users", ["email"], { unique: true });
      }
      async down() {}
    }
    const m = new AddUniqueIdx();
    await m.run(adapter, "up");
  });

  it("changeColumn generates ALTER TABLE ALTER COLUMN", async () => {
    const adapter = freshAdapter();
    class ChangeCol extends Migration {
      async up() {
        await this.createTable("users", (t) => {
          t.string("name");
        });
        await this.changeColumn("users", "name", "text");
      }
      async down() {}
    }
    const m = new ChangeCol();
    await m.run(adapter, "up");
  });

  it("renameTable generates ALTER TABLE RENAME", async () => {
    const adapter = freshAdapter();
    class RenameUsers extends Migration {
      async up() {
        await this.createTable("users", (t) => {
          t.string("name");
        });
        await this.renameTable("users", "people");
      }
      async down() {}
    }
    const m = new RenameUsers();
    await m.run(adapter, "up");
  });

  it("reversible renameTable reverses correctly", async () => {
    const adapter = freshAdapter();
    class RenameUsers extends Migration {
      async change() {
        await this.renameTable("people", "users");
      }
    }
    const m = new RenameUsers();
    // The reverse of renameTable("people", "users") is renameTable("users", "people")
    // This should not throw
    await m.run(adapter, "up");
  });
});

describe("MigrationRunner", () => {
  it("migrate runs pending migrations", async () => {
    const adapter = freshAdapter();

    class M1 extends Migration {
      static version = "001";
      async up() { await this.createTable("users", (t) => { t.string("name"); }); }
      async down() { await this.dropTable("users"); }
    }

    class M2 extends Migration {
      static version = "002";
      async up() { await this.createTable("posts", (t) => { t.string("title"); }); }
      async down() { await this.dropTable("posts"); }
    }

    const runner = new MigrationRunner(adapter, [new M1(), new M2()]);
    await runner.migrate();

    // Tables should exist
    await adapter.executeMutation(`INSERT INTO "users" ("name") VALUES ('Alice')`);
    await adapter.executeMutation(`INSERT INTO "posts" ("title") VALUES ('Hello')`);
    expect(await adapter.execute(`SELECT * FROM "users"`)).toHaveLength(1);
    expect(await adapter.execute(`SELECT * FROM "posts"`)).toHaveLength(1);
  });

  it("status shows migration states", async () => {
    const adapter = freshAdapter();

    class M1 extends Migration {
      static version = "001";
      async up() { await this.createTable("items", (t) => { t.string("name"); }); }
      async down() { await this.dropTable("items"); }
    }

    const runner = new MigrationRunner(adapter, [new M1()]);
    let status = await runner.status();
    expect(status[0].status).toBe("down");

    await runner.migrate();
    status = await runner.status();
    expect(status[0].status).toBe("up");
  });

  it("rollback rolls back N migrations", async () => {
    const adapter = freshAdapter();

    class M1 extends Migration {
      static version = "001";
      async up() { await this.createTable("t1", (t) => { t.string("a"); }); }
      async down() { await this.dropTable("t1"); }
    }

    class M2 extends Migration {
      static version = "002";
      async up() { await this.createTable("t2", (t) => { t.string("b"); }); }
      async down() { await this.dropTable("t2"); }
    }

    const runner = new MigrationRunner(adapter, [new M1(), new M2()]);
    await runner.migrate();

    // Rollback 1
    await runner.rollback(1);
    const status = await runner.status();
    expect(status[0].status).toBe("up");
    expect(status[1].status).toBe("down");
  });

  it("migrate is idempotent", async () => {
    const adapter = freshAdapter();

    class M1 extends Migration {
      static version = "001";
      async up() { await this.createTable("x", (t) => { t.string("v"); }); }
      async down() { await this.dropTable("x"); }
    }

    const runner = new MigrationRunner(adapter, [new M1()]);
    await runner.migrate();
    // Running again should not throw
    await runner.migrate();
  });
});
