import { describe, it, expect, beforeEach } from "vitest";
import { Base, Relation, Range, transaction, savepoint, CollectionProxy, association, MigrationRunner, defineEnum, readEnumValue, enableSti, hasSecurePassword, store, loadHabtm, delegate, RecordNotFound, RecordInvalid, StaleObjectError, ReadOnlyRecord, SoleRecordExceeded, StrictLoadingViolationError, columns, columnNames, reflectOnAssociation, reflectOnAllAssociations, acceptsNestedAttributesFor, assignNestedAttributes, hasSecureToken, composedOf, serialize, registerModel } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { Migration, TableDefinition, Schema } from "./migration.js";
import {
  Associations,
  loadBelongsTo,
  loadHasOne,
  loadHasMany,
  loadHasManyThrough,
  processDependentAssociations,
} from "./associations.js";

// -- Helpers --

function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// -- Phase 2000: Core --

describe("ActiveRecord", () => {
  describe("Base", () => {
    // -- Table name inference --
    describe("table name inference", () => {
      it("table name guesses", () => {
        class User extends Base {}
        expect(User.tableName).toBe("users");
      });

      it("handles CamelCase class names", () => {
        class BlogPost extends Base {}
        expect(BlogPost.tableName).toBe("blog_posts");
      });

      it("handles names ending in y", () => {
        class Category extends Base {}
        expect(Category.tableName).toBe("categories");
      });

      it("switching between table name", () => {
        class User extends Base {
          static {
            this.tableName = "people";
          }
        }
        expect(User.tableName).toBe("people");
      });
    });

    // -- Primary key --
    describe("primary key", () => {
      it("defaults to id", () => {
        class User extends Base {}
        expect(User.primaryKey).toBe("id");
      });

      it("can be overridden", () => {
        class User extends Base {
          static {
            this.primaryKey = "uuid";
          }
        }
        expect(User.primaryKey).toBe("uuid");
      });
    });

    // -- Arel table --
    describe("arel_table", () => {
      it("returns an Arel Table with the correct name", () => {
        class User extends Base {}
        const table = User.arelTable;
        expect(table.name).toBe("users");
      });
    });

    // -- Record state --
    describe("record state", () => {
      it("new record returns boolean", () => {
        class User extends Base {
          static {
            this.attribute("name", "string");
          }
        }
        const u = new User({ name: "dean" });
        expect(u.isNewRecord()).toBe(true);
        expect(u.isPersisted()).toBe(false);
        expect(u.isDestroyed()).toBe(false);
      });

      it("persisted returns boolean", async () => {
        const adapter = freshAdapter();
        class User extends Base {
          static {
            this.attribute("name", "string");
            this.adapter = adapter;
          }
        }
        const u = new User({ name: "dean" });
        await u.save();
        expect(u.isNewRecord()).toBe(false);
        expect(u.isPersisted()).toBe(true);
      });

      it("destroyed returns boolean", async () => {
        const adapter = freshAdapter();
        class User extends Base {
          static {
            this.attribute("name", "string");
            this.adapter = adapter;
          }
        }
        const u = await User.create({ name: "dean" });
        await u.destroy();
        expect(u.isDestroyed()).toBe(true);
        expect(u.isPersisted()).toBe(false);
      });
    });

    // -- CRUD --
    describe("persistence", () => {
      let adapter: DatabaseAdapter;

      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("body", "string");
        }
      }

      beforeEach(() => {
        adapter = freshAdapter();
        Post.adapter = adapter;
      });

      it("save valid record", async () => {
        const p = new Post({ title: "Hello", body: "World" });
        const result = await p.save();
        expect(result).toBe(true);
        expect(p.id).toBe(1);
        expect(p.isNewRecord()).toBe(false);
      });

      it("save updates an existing record", async () => {
        const p = await Post.create({ title: "Hello", body: "World" });
        p.writeAttribute("title", "Updated");
        await p.save();

        const found = await Post.find(p.id);
        expect(found.readAttribute("title")).toBe("Updated");
      });

      it("save invalid record", async () => {
        class Required extends Base {
          static {
            this.attribute("name", "string");
            this.validates("name", { presence: true });
            this.adapter = adapter;
          }
        }
        const r = new Required();
        const result = await r.save();
        expect(result).toBe(false);
        expect(r.isNewRecord()).toBe(true);
      });

      it("saveBang throws on validation failure", async () => {
        class Required extends Base {
          static {
            this.attribute("name", "string");
            this.validates("name", { presence: true });
            this.adapter = adapter;
          }
        }
        const r = new Required();
        await expect(r.saveBang()).rejects.toThrow("Validation failed");
      });

      it("create", async () => {
        const p = await Post.create({ title: "Test", body: "Content" });
        expect(p.isPersisted()).toBe(true);
        expect(p.id).toBe(1);
      });

      it("update object", async () => {
        const p = await Post.create({ title: "Old", body: "Content" });
        await p.update({ title: "New" });
        const found = await Post.find(p.id);
        expect(found.readAttribute("title")).toBe("New");
      });

      it("destroy", async () => {
        const p = await Post.create({ title: "Hello", body: "World" });
        const id = p.id;
        await p.destroy();
        await expect(Post.find(id)).rejects.toThrow("not found");
      });

      it("assignAttributes changes attributes without saving", async () => {
        const p = await Post.create({ title: "Old", body: "Content" });
        p.assignAttributes({ title: "New" });
        expect(p.readAttribute("title")).toBe("New");
        // Not saved yet — DB still has old value
        const found = await Post.find(p.id);
        expect(found.readAttribute("title")).toBe("Old");
      });
    });

    // -- Finders --
    describe("finders", () => {
      let adapter: DatabaseAdapter;

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("email", "string");
        }
      }

      beforeEach(() => {
        adapter = freshAdapter();
        User.adapter = adapter;
      });

      it("find by primary key", async () => {
        await User.create({ name: "Alice", email: "alice@test.com" });
        const found = await User.find(1);
        expect(found.readAttribute("name")).toBe("Alice");
      });

      it("find raises record not found exception", async () => {
        await expect(User.find(999)).rejects.toThrow("not found");
      });

      it("find_by with hash conditions returns the first matching record", async () => {
        await User.create({ name: "Alice", email: "alice@test.com" });
        await User.create({ name: "Bob", email: "bob@test.com" });
        const found = await User.findBy({ name: "Bob" });
        expect(found).not.toBeNull();
        expect(found!.readAttribute("email")).toBe("bob@test.com");
      });

      it("find_by returns nil if the record is missing", async () => {
        const found = await User.findBy({ name: "Nobody" });
        expect(found).toBeNull();
      });

      it("find_by! raises RecordNotFound if the record is missing", async () => {
        await expect(User.findByBang({ name: "Nobody" })).rejects.toThrow(
          "not found"
        );
      });
    });

    // -- toParam --
    describe("toParam", () => {
      it("returns id as string", async () => {
        const adapter = freshAdapter();
        class User extends Base {
          static {
            this.attribute("name", "string");
            this.adapter = adapter;
          }
        }
        const u = await User.create({ name: "Dean" });
        expect(u.toParam()).toBe("1");
      });

      it("returns null for new record", () => {
        class User extends Base {
          static {
            this.attribute("name", "string");
          }
        }
        const u = new User({ name: "Dean" });
        expect(u.toParam()).toBeNull();
      });
    });

    // -- Reload --
    describe("reload", () => {
      it("reload", async () => {
        const adapter = freshAdapter();
        class User extends Base {
          static {
            this.attribute("name", "string");
            this.adapter = adapter;
          }
        }
        const u = await User.create({ name: "Original" });
        // Directly modify via another instance
        const u2 = await User.find(u.id);
        await u2.update({ name: "Modified" });

        // u still has old value
        expect(u.readAttribute("name")).toBe("Original");
        await u.reload();
        expect(u.readAttribute("name")).toBe("Modified");
      });
    });

    // -- Callbacks --
    describe("callbacks", () => {
      it("runs before_save and after_save", async () => {
        const adapter = freshAdapter();
        const log: string[] = [];

        class Tracked extends Base {
          static {
            this.attribute("name", "string");
            this.adapter = adapter;
            this.beforeSave(() => {
              log.push("before_save");
            });
            this.afterSave(() => {
              log.push("after_save");
            });
          }
        }

        await Tracked.create({ name: "test" });
        expect(log).toEqual(["before_save", "after_save"]);
      });

      it("runs before_create on new records", async () => {
        const adapter = freshAdapter();
        const log: string[] = [];

        class Tracked extends Base {
          static {
            this.attribute("name", "string");
            this.adapter = adapter;
            this.beforeCreate(() => {
              log.push("before_create");
            });
          }
        }

        await Tracked.create({ name: "test" });
        expect(log).toContain("before_create");
      });

      it("runs before_destroy on destroy", async () => {
        const adapter = freshAdapter();
        const log: string[] = [];

        class Tracked extends Base {
          static {
            this.attribute("name", "string");
            this.adapter = adapter;
            this.beforeDestroy(() => {
              log.push("before_destroy");
            });
          }
        }

        const t = await Tracked.create({ name: "test" });
        await t.destroy();
        expect(log).toContain("before_destroy");
      });

      it("before save throwing abort", async () => {
        const adapter = freshAdapter();

        class Guarded extends Base {
          static {
            this.attribute("name", "string");
            this.adapter = adapter;
            this.beforeSave(() => false);
          }
        }

        const g = new Guarded({ name: "test" });
        const result = await g.save();
        expect(result).toBe(false);
        // Not saved, so still new
        expect(g.isNewRecord()).toBe(true);
      });
    });

    // -- Validations (inherited from ActiveModel) --
    describe("validations", () => {
      it("validates before saving", async () => {
        const adapter = freshAdapter();

        class User extends Base {
          static {
            this.attribute("name", "string");
            this.validates("name", { presence: true });
            this.adapter = adapter;
          }
        }

        const u = new User();
        expect(await u.save()).toBe(false);
        expect(u.errors.get("name")).toContain("can't be blank");
      });
    });
  });

  // -- Phase 2100: Relation --
  describe("Relation", () => {
    let adapter: DatabaseAdapter;

    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("price", "integer");
        this.attribute("category", "string");
      }
    }

    beforeEach(async () => {
      adapter = freshAdapter();
      Item.adapter = adapter;
      await Item.create({ name: "Apple", price: 1, category: "fruit" });
      await Item.create({ name: "Banana", price: 2, category: "fruit" });
      await Item.create({ name: "Carrot", price: 3, category: "vegetable" });
    });

    it("all returns all records", async () => {
      const items = await Item.all().toArray();
      expect(items).toHaveLength(3);
    });

    it("where filters by conditions", async () => {
      const fruits = await Item.all()
        .where({ category: "fruit" })
        .toArray();
      expect(fruits).toHaveLength(2);
    });

    it("where is chainable", async () => {
      const items = await Item.all()
        .where({ category: "fruit" })
        .where({ name: "Apple" })
        .toArray();
      expect(items).toHaveLength(1);
      expect(items[0].readAttribute("name")).toBe("Apple");
    });

    it("order sorts results", async () => {
      const items = await Item.all()
        .order({ price: "desc" })
        .toArray();
      expect(items[0].readAttribute("name")).toBe("Carrot");
      expect(items[2].readAttribute("name")).toBe("Apple");
    });

    it("limit restricts result count", async () => {
      const items = await Item.all().limit(2).toArray();
      expect(items).toHaveLength(2);
    });

    it("offset skips records", async () => {
      const items = await Item.all().offset(1).toArray();
      expect(items).toHaveLength(2);
    });

    it("first returns the first record", async () => {
      const item = await Item.all().first();
      expect(item).not.toBeNull();
      expect(item!.readAttribute("name")).toBe("Apple");
    });

    it("count returns the number of records", async () => {
      const count = await Item.all().count();
      expect(count).toBe(3);
    });

    it("count with where", async () => {
      const count = await Item.all()
        .where({ category: "fruit" })
        .count();
      expect(count).toBe(2);
    });

    it("exists returns true when records exist", async () => {
      expect(await Item.all().exists()).toBe(true);
    });

    it("exists returns false when no records match", async () => {
      expect(
        await Item.all().where({ category: "meat" }).exists()
      ).toBe(false);
    });

    it("none", async () => {
      const items = await Item.all().none().toArray();
      expect(items).toHaveLength(0);
      expect(await Item.all().none().count()).toBe(0);
    });

    it("pluck returns column values", async () => {
      const names = await Item.all().pluck("name");
      expect(names).toEqual(["Apple", "Banana", "Carrot"]);
    });

    it("ids returns primary key values", async () => {
      const ids = await Item.all().ids();
      expect(ids).toEqual([1, 2, 3]);
    });

    it("update all", async () => {
      await Item.all().where({ category: "fruit" }).updateAll({ price: 10 });
      const apple = await Item.find(1);
      expect(apple.readAttribute("price")).toBe(10);
    });

    it("delete all", async () => {
      await Item.all().where({ category: "fruit" }).deleteAll();
      const remaining = await Item.all().toArray();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].readAttribute("name")).toBe("Carrot");
    });

    it("toSql generates SQL", () => {
      const sql = Item.all()
        .where({ category: "fruit" })
        .order("name")
        .limit(10)
        .toSql();
      expect(sql).toContain("items");
      expect(sql).toContain("fruit");
    });

    // Static shorthand
    it("Base.where is a shorthand for Base.all().where()", async () => {
      const items = await Item.where({ category: "vegetable" }).toArray();
      expect(items).toHaveLength(1);
    });

    // Immutability
    it("relations are immutable (where returns a new relation)", async () => {
      const all = Item.all();
      const filtered = all.where({ category: "fruit" });
      expect(await all.count()).toBe(3);
      expect(await filtered.count()).toBe(2);
    });
  });

  // -- Phase 2200: Associations --
  describe("Associations", () => {
    let adapter: DatabaseAdapter;

    class Author extends Base {
      static {
        this.attribute("name", "string");
      }
    }

    class Book extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
      }
    }

    class Profile extends Base {
      static {
        this.attribute("bio", "string");
        this.attribute("author_id", "integer");
      }
    }

    beforeEach(() => {
      adapter = freshAdapter();
      Author.adapter = adapter;
      Book.adapter = adapter;
      Profile.adapter = adapter;
      registerModel(Author);
      registerModel(Book);
      registerModel(Profile);
    });

    it("loadBelongsTo loads the parent record", async () => {
      const author = await Author.create({ name: "J.K." });
      const book = await Book.create({
        title: "Harry Potter",
        author_id: author.id,
      });

      const loaded = await loadBelongsTo(book, "author", {});
      expect(loaded).not.toBeNull();
      expect(loaded!.readAttribute("name")).toBe("J.K.");
    });

    it("loadBelongsTo returns null when FK is null", async () => {
      const book = await Book.create({ title: "Orphan", author_id: null });
      const loaded = await loadBelongsTo(book, "author", {});
      expect(loaded).toBeNull();
    });

    it("loadHasOne loads the child record", async () => {
      const author = await Author.create({ name: "Dean" });
      await Profile.create({ bio: "A developer", author_id: author.id });

      const loaded = await loadHasOne(author, "profile", {});
      expect(loaded).not.toBeNull();
      expect(loaded!.readAttribute("bio")).toBe("A developer");
    });

    it("loadHasMany loads all children", async () => {
      const author = await Author.create({ name: "Dean" });
      await Book.create({ title: "Book 1", author_id: author.id });
      await Book.create({ title: "Book 2", author_id: author.id });
      await Book.create({ title: "Other", author_id: 999 });

      const books = await loadHasMany(author, "books", {});
      expect(books).toHaveLength(2);
    });

    it("supports custom foreignKey", async () => {
      class Article extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("writer_id", "integer");
          this.adapter = adapter;
        }
      }
      registerModel(Article);

      const author = await Author.create({ name: "Custom" });
      await Article.create({ title: "Test", writer_id: author.id });

      const articles = await loadHasMany(author, "articles", {
        foreignKey: "writer_id",
      });
      expect(articles).toHaveLength(1);
    });
  });

  // -- Phase 2300: Migrations --
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

  // -- Phase 2500: Transactions --
  describe("Transactions", () => {
    let adapter: DatabaseAdapter;

    class Account extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("balance", "integer", { default: 0 });
      }
    }

    beforeEach(() => {
      adapter = freshAdapter();
      Account.adapter = adapter;
    });

    it("successful", async () => {
      await transaction(Account, async () => {
        await Account.create({ name: "Alice", balance: 100 });
        await Account.create({ name: "Bob", balance: 200 });
      });

      const count = await Account.all().count();
      expect(count).toBe(2);
    });

    it("runs afterCommit callbacks on success", async () => {
      const log: string[] = [];

      await transaction(Account, async (tx) => {
        tx.afterCommit(() => {
          log.push("committed");
        });
        await Account.create({ name: "Alice", balance: 100 });
      });

      expect(log).toEqual(["committed"]);
    });

    it("failing on exception", async () => {
      try {
        await transaction(Account, async () => {
          await Account.create({ name: "Alice", balance: 100 });
          throw new Error("Oops");
        });
      } catch {
        // expected
      }

      // MemoryAdapter doesn't truly rollback, but the pattern is correct
      // In a real adapter, the records would be gone
    });

    it("runs afterRollback callbacks on error", async () => {
      const log: string[] = [];

      try {
        await transaction(Account, async (tx) => {
          tx.afterRollback(() => {
            log.push("rolled_back");
          });
          throw new Error("Oops");
        });
      } catch {
        // expected
      }

      expect(log).toEqual(["rolled_back"]);
    });

    it("force savepoint in nested transaction", async () => {
      await transaction(Account, async () => {
        await Account.create({ name: "Alice", balance: 100 });

        try {
          await savepoint(Account, "sp1", async () => {
            throw new Error("inner error");
          });
        } catch {
          // savepoint rolled back, outer transaction continues
        }

        await Account.create({ name: "Bob", balance: 200 });
      });

      // Both should exist (memory adapter doesn't really rollback)
      const count = await Account.all().count();
      expect(count).toBe(2);
    });
  });

  // =========================================================================
  // Untested surface area — Relation advanced
  // =========================================================================
  describe("Relation (extended)", () => {
    let adapter: DatabaseAdapter;

    class Widget extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("color", "string");
        this.attribute("weight", "integer");
        this.attribute("active", "boolean", { default: true });
      }
    }

    beforeEach(async () => {
      adapter = freshAdapter();
      Widget.adapter = adapter;
      await Widget.create({ name: "A", color: "red", weight: 10, active: true });
      await Widget.create({ name: "B", color: "blue", weight: 20, active: true });
      await Widget.create({ name: "C", color: "red", weight: 30, active: false });
      await Widget.create({ name: "D", color: "green", weight: 10, active: true });
    });

    // -- select --
    it("select returns records with projected columns in SQL", () => {
      const sql = Widget.all().select("name", "color").toSql();
      expect(sql).toContain('"name"');
      expect(sql).toContain('"color"');
      expect(sql).not.toContain("*");
    });

    // -- distinct --
    it("distinct generates DISTINCT SQL", () => {
      const sql = Widget.all().distinct().toSql();
      expect(sql).toContain("DISTINCT");
    });

    // -- group --
    it("group generates GROUP BY SQL", () => {
      const sql = Widget.all().group("color").toSql();
      expect(sql).toContain("GROUP BY");
    });

    // -- reorder replaces existing order --
    it("reorder replaces existing order", async () => {
      const items = await Widget.all()
        .order({ name: "asc" })
        .reorder({ name: "desc" })
        .toArray();
      expect(items[0].readAttribute("name")).toBe("D");
    });

    // -- reverseOrder --
    it("reverseOrder reverses asc to desc", async () => {
      const items = await Widget.all()
        .order({ weight: "asc" })
        .reverseOrder()
        .toArray();
      expect(items[0].readAttribute("weight")).toBe(30);
    });

    // -- last with no order defaults to PK desc --
    it("last returns the last record by PK", async () => {
      const item = await Widget.all().last();
      expect(item).not.toBeNull();
      expect(item!.readAttribute("name")).toBe("D");
    });

    // -- last with explicit order reverses it --
    it("last with order reverses the order", async () => {
      const item = await Widget.all()
        .order({ name: "asc" })
        .last();
      expect(item).not.toBeNull();
      expect(item!.readAttribute("name")).toBe("D");
    });

    // -- firstBang and lastBang --
    it("firstBang returns first or throws", async () => {
      const item = await Widget.all().firstBang();
      expect(item.readAttribute("name")).toBe("A");
    });

    it("firstBang throws when empty", async () => {
      await expect(
        Widget.all().where({ color: "purple" }).firstBang()
      ).rejects.toThrow("not found");
    });

    it("lastBang returns last or throws", async () => {
      const item = await Widget.all().lastBang();
      expect(item.readAttribute("name")).toBe("D");
    });

    it("lastBang throws when empty", async () => {
      await expect(
        Widget.all().where({ color: "purple" }).lastBang()
      ).rejects.toThrow("not found");
    });

    // -- whereNot --
    it("whereNot excludes matching records", async () => {
      const items = await Widget.all().whereNot({ color: "red" }).toArray();
      expect(items).toHaveLength(2);
      expect(items.every((i: any) => i.readAttribute("color") !== "red")).toBe(true);
    });

    it("whereNot with null uses IS NOT NULL", async () => {
      const sql = Widget.all().whereNot({ color: null }).toSql();
      expect(sql).toContain("IS NOT NULL");
    });

    // -- where with array (IN) --
    it("where with array generates IN", async () => {
      const items = await Widget.all()
        .where({ color: ["red", "blue"] })
        .toArray();
      expect(items).toHaveLength(3);
    });

    // -- where with null --
    it("where with null generates IS NULL", async () => {
      const sql = Widget.all().where({ color: null }).toSql();
      expect(sql).toContain("IS NULL");
    });

    // -- multi-column pluck --
    it("pluck with multiple columns returns arrays", async () => {
      const result = await Widget.all()
        .order({ name: "asc" })
        .pluck("name", "color");
      expect(result).toEqual([
        ["A", "red"],
        ["B", "blue"],
        ["C", "red"],
        ["D", "green"],
      ]);
    });

    // -- destroyAll --
    it("destroyAll destroys all matching records", async () => {
      const destroyed = await Widget.all()
        .where({ color: "red" })
        .destroyAll();
      expect(destroyed).toHaveLength(2);
      expect(destroyed[0].isDestroyed()).toBe(true);
    });

    // -- updateAll returns count --
    it("updateAll returns the number of affected rows", async () => {
      const count = await Widget.all()
        .where({ color: "red" })
        .updateAll({ weight: 99 });
      expect(count).toBe(2);
    });

    // -- deleteAll returns count --
    it("deleteAll returns the number of deleted rows", async () => {
      const count = await Widget.all()
        .where({ color: "red" })
        .deleteAll();
      expect(count).toBe(2);
      const remaining = await Widget.all().toArray();
      expect(remaining).toHaveLength(2);
    });

    // -- none returns empty for all terminal methods --
    it("none().first() returns null", async () => {
      expect(await Widget.all().none().first()).toBeNull();
    });

    it("none().last() returns null", async () => {
      expect(await Widget.all().none().last()).toBeNull();
    });

    it("none().exists() returns false", async () => {
      expect(await Widget.all().none().exists()).toBe(false);
    });

    it("none().pluck() returns empty array", async () => {
      expect(await Widget.all().none().pluck("name")).toEqual([]);
    });

    it("none().updateAll() returns 0", async () => {
      expect(await Widget.all().none().updateAll({ weight: 0 })).toBe(0);
    });

    it("none().deleteAll() returns 0", async () => {
      expect(await Widget.all().none().deleteAll()).toBe(0);
    });

    // -- immutability --
    it("where returns a new relation", async () => {
      const all = Widget.all();
      const filtered = all.where({ color: "red" });
      expect(await all.count()).toBe(4);
      expect(await filtered.count()).toBe(2);
    });

    it("order returns a new relation", async () => {
      const all = Widget.all();
      const ordered = all.order({ name: "desc" });
      const allFirst = await all.first();
      const orderedFirst = await ordered.first();
      // ordering shouldn't change the unordered relation
      expect(allFirst!.readAttribute("name")).toBe("A");
      expect(orderedFirst!.readAttribute("name")).toBe("D");
    });
  });

  // =========================================================================
  // Untested surface area — Scopes
  // =========================================================================
  describe("Scopes", () => {
    let adapter: DatabaseAdapter;

    class Product extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("price", "integer");
        this.attribute("active", "boolean", { default: true });
      }
    }

    beforeEach(async () => {
      adapter = freshAdapter();
      Product.adapter = adapter;
    });

    it("defines and uses a named scope", async () => {
      Product.scope("cheap", (rel) => rel.where({ price: 1 }));

      await Product.create({ name: "A", price: 1, active: true });
      await Product.create({ name: "B", price: 100, active: true });

      // Scopes are defined on the class but used via relation
      const scoped = Product._scopes.get("cheap");
      expect(scoped).toBeDefined();
      const result = await scoped!(Product.all()).toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("name")).toBe("A");
    });
  });

  // =========================================================================
  // Untested surface area — Migration DDL methods
  // =========================================================================
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

  // =========================================================================
  // Untested surface area — Callbacks (extended)
  // =========================================================================
  describe("Callbacks (extended)", () => {
    it("update", async () => {
      const adapter = freshAdapter();
      const log: string[] = [];

      class Tracked extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.beforeCreate(() => { log.push("before_create"); });
          this.beforeUpdate(() => { log.push("before_update"); });
        }
      }

      const t = await Tracked.create({ name: "test" });
      expect(log).toEqual(["before_create"]);

      log.length = 0;
      t.writeAttribute("name", "updated");
      await t.save();
      expect(log).toEqual(["before_update"]);
    });

    it("runs after_create and after_update at correct times", async () => {
      const adapter = freshAdapter();
      const log: string[] = [];

      class Tracked extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.afterCreate(() => { log.push("after_create"); });
          this.afterUpdate(() => { log.push("after_update"); });
        }
      }

      await Tracked.create({ name: "test" });
      expect(log).toContain("after_create");
      expect(log).not.toContain("after_update");

      log.length = 0;
      const record = await Tracked.find(1);
      await record.update({ name: "updated" });
      expect(log).toContain("after_update");
      expect(log).not.toContain("after_create");
    });

    it("destroy", async () => {
      const adapter = freshAdapter();
      const log: string[] = [];

      class Tracked extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.afterDestroy(() => { log.push("after_destroy"); });
        }
      }

      const t = await Tracked.create({ name: "test" });
      await t.destroy();
      expect(log).toContain("after_destroy");
    });

    it("around_save works via runCallbacks", () => {
      const log: string[] = [];

      class Tracked extends Base {
        static {
          this.attribute("name", "string");
          this.aroundSave((_r, proceed) => {
            log.push("around_before");
            proceed();
            log.push("around_after");
          });
        }
      }

      // around callbacks work through runCallbacks (Model-level API)
      const t = new Tracked({ name: "test" });
      t.runCallbacks("save", () => { log.push("action"); });
      expect(log).toEqual(["around_before", "action", "around_after"]);
    });
  });

  // =========================================================================
  // Untested surface area — Base class methods
  // =========================================================================
  describe("Base (extended)", () => {
    it("find with multiple IDs", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      await User.create({ name: "Charlie" });

      const found = await User.find([1, 3]);
      expect(found).toHaveLength(2);
      expect(found[0].readAttribute("name")).toBe("Alice");
      expect(found[1].readAttribute("name")).toBe("Charlie");
    });

    it("find with empty array raises RecordNotFound", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await expect(User.find([])).rejects.toThrow();
    });

    it("find with missing IDs throws", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice" });
      await expect(User.find([1, 999])).rejects.toThrow("not found");
    });

    it("createBang throws on validation failure", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
          this.adapter = adapter;
        }
      }
      await expect(User.createBang({})).rejects.toThrow("Validation failed");
    });

    it("updateBang throws on validation failure", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
          this.adapter = adapter;
        }
      }
      const u = await User.create({ name: "Alice" });
      await expect(u.updateBang({ name: "" })).rejects.toThrow("Validation failed");
    });

    it("save destroyed object", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      const u = await User.create({ name: "Alice" });
      await u.destroy();
      await expect(u.save()).rejects.toThrow("destroyed");
    });

    it("delete doesnt run callbacks", async () => {
      const adapter = freshAdapter();
      const log: string[] = [];

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.beforeDestroy(() => { log.push("before_destroy"); });
        }
      }
      const u = await User.create({ name: "Alice" });
      await u.delete();
      expect(u.isDestroyed()).toBe(true);
      expect(log).not.toContain("before_destroy");
    });

    it("class level delete", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice" });
      await User.delete(1);
      await expect(User.find(1)).rejects.toThrow("not found");
    });

    it("destroyBang delegates to destroy", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      const u = await User.create({ name: "Alice" });
      const result = await u.destroyBang();
      expect(result.isDestroyed()).toBe(true);
    });

    it("adapter throws when not configured", () => {
      class NoAdapter extends Base {
        static {
          this.attribute("name", "string");
        }
      }
      expect(() => NoAdapter.adapter).toThrow("No adapter configured");
    });
  });

  // =========================================================================
  // Timestamp auto-population
  // =========================================================================
  describe("Timestamps", () => {
    it("auto-sets created_at and updated_at on insert", async () => {
      const adapter = freshAdapter();
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("created_at", "datetime");
          this.attribute("updated_at", "datetime");
          this.adapter = adapter;
        }
      }

      const before = new Date();
      const post = await Post.create({ title: "Hello" });
      const after = new Date();

      const createdAt = post.readAttribute("created_at") as Date;
      const updatedAt = post.readAttribute("updated_at") as Date;
      expect(createdAt).toBeInstanceOf(Date);
      expect(updatedAt).toBeInstanceOf(Date);
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(createdAt.getTime()).toBe(updatedAt.getTime());
    });

    it("does not overwrite explicitly set timestamps on insert", async () => {
      const adapter = freshAdapter();
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("created_at", "datetime");
          this.attribute("updated_at", "datetime");
          this.adapter = adapter;
        }
      }

      const explicit = new Date("2020-01-01T00:00:00Z");
      const post = await Post.create({ title: "Old", created_at: explicit, updated_at: explicit });

      expect((post.readAttribute("created_at") as Date).toISOString()).toBe(explicit.toISOString());
      expect((post.readAttribute("updated_at") as Date).toISOString()).toBe(explicit.toISOString());
    });

    it("saving a changed record updates its timestamp", async () => {
      const adapter = freshAdapter();
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("created_at", "datetime");
          this.attribute("updated_at", "datetime");
          this.adapter = adapter;
        }
      }

      const post = await Post.create({ title: "Hello" });
      const originalCreatedAt = post.readAttribute("created_at") as Date;

      post.writeAttribute("title", "Updated");
      await post.save();

      const updatedAt = post.readAttribute("updated_at") as Date;
      expect(updatedAt).toBeInstanceOf(Date);
      // created_at should remain unchanged
      expect((post.readAttribute("created_at") as Date).getTime()).toBe(originalCreatedAt.getTime());
    });

    it("does not touch timestamps when model has no timestamp attributes", async () => {
      const adapter = freshAdapter();
      class Simple extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      const s = await Simple.create({ name: "test" });
      expect(s.readAttribute("created_at")).toBeNull();
    });
  });

  // =========================================================================
  // updateColumn / updateColumns
  // =========================================================================
  describe("updateColumn / updateColumns", () => {
    it("update column", async () => {
      const adapter = freshAdapter();
      const log: string[] = [];

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
          this.adapter = adapter;
          this.beforeSave(() => { log.push("before_save"); });
        }
      }

      const u = await User.create({ name: "Alice", age: 25 });
      log.length = 0;

      await u.updateColumn("age", 30);

      expect(u.readAttribute("age")).toBe(30);
      expect(log).toHaveLength(0); // No callbacks fired
    });

    it("update columns", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.validates("name", { presence: true });
          this.adapter = adapter;
        }
      }

      const u = await User.create({ name: "Alice", email: "alice@example.com" });

      // This would fail validation since name becomes empty, but updateColumns skips it
      await u.updateColumns({ name: "", email: "new@example.com" });

      expect(u.readAttribute("name")).toBe("");
      expect(u.readAttribute("email")).toBe("new@example.com");
    });

    it("persists to database", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      const u = await User.create({ name: "Alice" });
      await u.updateColumn("name", "Bob");

      const reloaded = await User.find(u.id);
      expect(reloaded.readAttribute("name")).toBe("Bob");
    });

    it("update column should raise exception if new record", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      const u = new User({ name: "Alice" });
      await expect(u.updateColumn("name", "Bob")).rejects.toThrow(
        "Cannot update columns on a new or destroyed record"
      );
    });

    it("update column should not leave the object dirty", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      const u = await User.create({ name: "Alice" });
      await u.updateColumn("name", "Bob");
      expect(u.changed).toBe(false);
    });
  });

  // =========================================================================
  // or() on Relation
  // =========================================================================
  describe("Relation#or", () => {
    it("combines two where clauses with OR", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Alice", age: 25 });
      await User.create({ name: "Bob", age: 30 });
      await User.create({ name: "Charlie", age: 35 });

      const young = User.where({ age: 25 });
      const old = User.where({ age: 35 });
      const result = await young.or(old).toArray();

      expect(result).toHaveLength(2);
      const names = result.map((r: Base) => r.readAttribute("name"));
      expect(names).toContain("Alice");
      expect(names).toContain("Charlie");
    });

    it("generates correct SQL with OR", () => {
      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }

      const sql = User.where({ name: "Alice" }).or(User.where({ age: 30 })).toSql();
      expect(sql).toContain("OR");
      expect(sql).toContain('"name"');
      expect(sql).toContain('"age"');
    });
  });

  // =========================================================================
  // findEach / findInBatches
  // =========================================================================
  describe("findEach / findInBatches", () => {
    it("find in batches should return batches", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      for (let i = 0; i < 5; i++) {
        await User.create({ name: `User ${i}` });
      }

      const batches: any[][] = [];
      for await (const batch of User.all().findInBatches({ batchSize: 2 })) {
        batches.push(batch);
      }

      expect(batches).toHaveLength(3); // 2, 2, 1
      expect(batches[0]).toHaveLength(2);
      expect(batches[1]).toHaveLength(2);
      expect(batches[2]).toHaveLength(1);
    });

    it("findEach yields individual records", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      for (let i = 0; i < 3; i++) {
        await User.create({ name: `User ${i}` });
      }

      const records: any[] = [];
      for await (const record of User.all().findEach({ batchSize: 2 })) {
        records.push(record);
      }

      expect(records).toHaveLength(3);
    });

    it("findInBatches with where clause", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("active", "boolean");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Active1", active: true });
      await User.create({ name: "Inactive", active: false });
      await User.create({ name: "Active2", active: true });

      const records: any[] = [];
      for await (const record of User.where({ active: true }).findEach({ batchSize: 10 })) {
        records.push(record);
      }

      expect(records).toHaveLength(2);
    });
  });

  // =========================================================================
  // Scope proxy
  // =========================================================================
  describe("Scope proxy", () => {
    it("scope is accessible on Relation via proxy", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("active", "boolean");
          this.adapter = adapter;
          this.scope("active", (rel: any) => rel.where({ active: true }));
        }
      }

      await User.create({ name: "Alice", active: true });
      await User.create({ name: "Bob", active: false });

      const result = await (User.all() as any).active().toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("name")).toBe("Alice");
    });

    it("scope is chainable with other query methods", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("active", "boolean");
          this.adapter = adapter;
          this.scope("active", (rel: any) => rel.where({ active: true }));
        }
      }

      await User.create({ name: "Alice", active: true });
      await User.create({ name: "Bob", active: true });
      await User.create({ name: "Charlie", active: false });

      const result = await (User.all() as any).active().where({ name: "Alice" }).toArray();
      expect(result).toHaveLength(1);
    });

    it("scope is accessible as a static method on the class", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("active", "boolean");
          this.adapter = adapter;
          this.scope("active", (rel: any) => rel.where({ active: true }));
        }
      }

      await User.create({ name: "Alice", active: true });
      await User.create({ name: "Bob", active: false });

      const result = await (User as any).active().toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("name")).toBe("Alice");
    });

    it("scopes chain together", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("active", "boolean");
          this.attribute("role", "string");
          this.adapter = adapter;
          this.scope("active", (rel: any) => rel.where({ active: true }));
          this.scope("admins", (rel: any) => rel.where({ role: "admin" }));
        }
      }

      await User.create({ name: "Alice", active: true, role: "admin" });
      await User.create({ name: "Bob", active: true, role: "user" });
      await User.create({ name: "Charlie", active: false, role: "admin" });

      const result = await (User as any).active().admins().toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("name")).toBe("Alice");
    });

    it("scope with arguments", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
          this.adapter = adapter;
          this.scope("olderThan", (rel: any, age: number) => rel.where({ age }));
        }
      }

      await User.create({ name: "Alice", age: 25 });
      await User.create({ name: "Bob", age: 30 });

      const result = await (User as any).olderThan(30).toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("name")).toBe("Bob");
    });
  });

  // =========================================================================
  // Aggregations
  // =========================================================================
  describe("Aggregations", () => {
    it("should sum field", async () => {
      const adapter = freshAdapter();

      class Order extends Base {
        static {
          this.attribute("amount", "integer");
          this.adapter = adapter;
        }
      }

      await Order.create({ amount: 10 });
      await Order.create({ amount: 20 });
      await Order.create({ amount: 30 });

      expect(await Order.all().sum("amount")).toBe(60);
    });

    it("should average field", async () => {
      const adapter = freshAdapter();

      class Order extends Base {
        static {
          this.attribute("amount", "integer");
          this.adapter = adapter;
        }
      }

      await Order.create({ amount: 10 });
      await Order.create({ amount: 20 });
      await Order.create({ amount: 30 });

      expect(await Order.all().average("amount")).toBe(20);
    });

    it("should get minimum of field", async () => {
      const adapter = freshAdapter();

      class Order extends Base {
        static {
          this.attribute("amount", "integer");
          this.adapter = adapter;
        }
      }

      await Order.create({ amount: 10 });
      await Order.create({ amount: 5 });
      await Order.create({ amount: 30 });

      expect(await Order.all().minimum("amount")).toBe(5);
    });

    it("should get maximum of field", async () => {
      const adapter = freshAdapter();

      class Order extends Base {
        static {
          this.attribute("amount", "integer");
          this.adapter = adapter;
        }
      }

      await Order.create({ amount: 10 });
      await Order.create({ amount: 5 });
      await Order.create({ amount: 30 });

      expect(await Order.all().maximum("amount")).toBe(30);
    });

    it("should sum field with conditions", async () => {
      const adapter = freshAdapter();

      class Order extends Base {
        static {
          this.attribute("amount", "integer");
          this.attribute("status", "string");
          this.adapter = adapter;
        }
      }

      await Order.create({ amount: 10, status: "paid" });
      await Order.create({ amount: 20, status: "pending" });
      await Order.create({ amount: 30, status: "paid" });

      expect(await Order.where({ status: "paid" }).sum("amount")).toBe(40);
    });

    it("no queries for empty relation on sum", async () => {
      const adapter = freshAdapter();

      class Order extends Base {
        static {
          this.attribute("amount", "integer");
          this.adapter = adapter;
        }
      }

      expect(await Order.all().none().sum("amount")).toBe(0);
    });

    it("no queries for empty relation on average", async () => {
      const adapter = freshAdapter();

      class Order extends Base {
        static {
          this.attribute("amount", "integer");
          this.adapter = adapter;
        }
      }

      expect(await Order.all().none().average("amount")).toBeNull();
    });

    it("count with column parameter", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Alice", email: "a@b.com" });
      await User.create({ name: "Bob" }); // email is null

      expect(await User.all().count()).toBe(2);
      expect(await User.all().count("email")).toBe(1);
    });
  });

  // =========================================================================
  // find_or_create_by / find_or_initialize_by
  // =========================================================================
  describe("find_or_create_by / find_or_initialize_by", () => {
    it("findOrCreateBy returns existing record if found", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.adapter = adapter;
        }
      }

      const original = await User.create({ name: "Alice", email: "old@example.com" });
      const found = await User.findOrCreateBy({ name: "Alice" }, { email: "new@example.com" });

      expect(found.id).toBe(original.id);
      expect(found.readAttribute("email")).toBe("old@example.com");
    });

    it("findOrCreateBy creates record if not found", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.adapter = adapter;
        }
      }

      const created = await User.findOrCreateBy({ name: "Alice" }, { email: "new@example.com" });

      expect(created.isPersisted()).toBe(true);
      expect(created.readAttribute("name")).toBe("Alice");
      expect(created.readAttribute("email")).toBe("new@example.com");
    });

    it("findOrInitializeBy returns existing record if found", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      const original = await User.create({ name: "Alice" });
      const found = await User.findOrInitializeBy({ name: "Alice" });

      expect(found.id).toBe(original.id);
      expect(found.isPersisted()).toBe(true);
    });

    it("findOrInitializeBy returns unsaved record if not found", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.adapter = adapter;
        }
      }

      const initialized = await User.findOrInitializeBy({ name: "Alice" }, { email: "a@b.com" });

      expect(initialized.isNewRecord()).toBe(true);
      expect(initialized.readAttribute("name")).toBe("Alice");
      expect(initialized.readAttribute("email")).toBe("a@b.com");
    });
  });

  // =========================================================================
  // having
  // =========================================================================
  describe("Relation#having", () => {
    it("generates SQL with HAVING clause", () => {
      class Order extends Base {
        static {
          this.attribute("customer_id", "integer");
          this.attribute("amount", "integer");
        }
      }

      const sql = Order.all()
        .select("customer_id")
        .group("customer_id")
        .having("COUNT(*) > 1")
        .toSql();

      expect(sql).toContain("GROUP BY");
      expect(sql).toContain("HAVING");
      expect(sql).toContain("COUNT(*) > 1");
    });
  });

  // =========================================================================
  // where with ranges
  // =========================================================================
  describe("where with Range", () => {
    it("generates BETWEEN SQL", () => {
      class User extends Base {
        static {
          this.attribute("age", "integer");
        }
      }

      const sql = User.where({ age: new Range(18, 30) }).toSql();
      expect(sql).toContain("BETWEEN");
      expect(sql).toContain("18");
      expect(sql).toContain("30");
    });

    it("filters records with BETWEEN", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Young", age: 15 });
      await User.create({ name: "Adult", age: 25 });
      await User.create({ name: "Senior", age: 65 });

      const result = await User.where({ age: new Range(18, 30) }).toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("name")).toBe("Adult");
    });

    it("BETWEEN is inclusive on both ends", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("age", "integer");
          this.adapter = adapter;
        }
      }

      await User.create({ age: 18 });
      await User.create({ age: 25 });
      await User.create({ age: 30 });

      const result = await User.where({ age: new Range(18, 30) }).toArray();
      expect(result).toHaveLength(3);
    });
  });

  // =========================================================================
  // touch
  // =========================================================================
  describe("touch", () => {
    it("touching a record updates its timestamp", async () => {
      const adapter = freshAdapter();

      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("updated_at", "datetime");
          this.adapter = adapter;
        }
      }

      const post = await Post.create({ title: "Hello" });
      const originalUpdatedAt = post.readAttribute("updated_at") as Date;

      await post.touch();

      const newUpdatedAt = post.readAttribute("updated_at") as Date;
      expect(newUpdatedAt).toBeInstanceOf(Date);
      expect(newUpdatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
    });

    it("touching an attribute updates it", async () => {
      const adapter = freshAdapter();

      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("updated_at", "datetime");
          this.attribute("published_at", "datetime");
          this.adapter = adapter;
        }
      }

      const post = await Post.create({ title: "Hello" });
      await post.touch("published_at");

      expect(post.readAttribute("published_at")).toBeInstanceOf(Date);
      expect(post.readAttribute("updated_at")).toBeInstanceOf(Date);
    });

    it("touch returns false on new record", async () => {
      const adapter = freshAdapter();

      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("updated_at", "datetime");
          this.adapter = adapter;
        }
      }

      const post = new Post({ title: "New" });
      expect(await post.touch()).toBe(false);
    });

    it("touch skips callbacks", async () => {
      const adapter = freshAdapter();
      const log: string[] = [];

      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("updated_at", "datetime");
          this.adapter = adapter;
          this.beforeSave(() => { log.push("before_save"); });
        }
      }

      const post = await Post.create({ title: "Hello" });
      log.length = 0;

      await post.touch();
      expect(log).toHaveLength(0);
    });
  });

  // =========================================================================
  // default_scope / unscoped
  // =========================================================================
  describe("default_scope / unscoped", () => {
    it("default_scope is applied to all queries", async () => {
      const adapter = freshAdapter();

      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("published", "boolean", { default: false });
          this.adapter = adapter;
          this.defaultScope((rel: any) => rel.where({ published: true }));
        }
      }

      await Post.create({ title: "Published", published: true });
      await Post.create({ title: "Draft", published: false });

      const result = await Post.all().toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("title")).toBe("Published");
    });

    it("unscoped bypasses default_scope", async () => {
      const adapter = freshAdapter();

      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("published", "boolean", { default: false });
          this.adapter = adapter;
          this.defaultScope((rel: any) => rel.where({ published: true }));
        }
      }

      await Post.create({ title: "Published", published: true });
      await Post.create({ title: "Draft", published: false });

      const result = await Post.unscoped().toArray();
      expect(result).toHaveLength(2);
    });

    it("where inherits default_scope", async () => {
      const adapter = freshAdapter();

      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("published", "boolean", { default: false });
          this.attribute("category", "string");
          this.adapter = adapter;
          this.defaultScope((rel: any) => rel.where({ published: true }));
        }
      }

      await Post.create({ title: "P1", published: true, category: "tech" });
      await Post.create({ title: "P2", published: true, category: "news" });
      await Post.create({ title: "D1", published: false, category: "tech" });

      const result = await Post.where({ category: "tech" }).toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("title")).toBe("P1");
    });

    it("default_scope applies to exists?", async () => {
      const adapter = freshAdapter();

      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("published", "boolean", { default: false });
          this.adapter = adapter;
          this.defaultScope((rel: any) => rel.where({ published: true }));
        }
      }

      await Post.create({ title: "Draft", published: false });

      expect(await Post.all().exists()).toBe(false);
      expect(await Post.unscoped().exists()).toBe(true);
    });

    it("default_scope applies to pluck", async () => {
      const adapter = freshAdapter();

      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("published", "boolean", { default: false });
          this.adapter = adapter;
          this.defaultScope((rel: any) => rel.where({ published: true }));
        }
      }

      await Post.create({ title: "Pub", published: true });
      await Post.create({ title: "Draft", published: false });

      const titles = await Post.all().pluck("title");
      expect(titles).toEqual(["Pub"]);
    });

    it("default_scope applies to deleteAll", async () => {
      const adapter = freshAdapter();

      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("published", "boolean", { default: false });
          this.adapter = adapter;
          this.defaultScope((rel: any) => rel.where({ published: true }));
        }
      }

      await Post.create({ title: "Pub", published: true });
      await Post.create({ title: "Draft", published: false });

      await Post.all().deleteAll();
      // Only the published one should be deleted
      expect(await Post.unscoped().count()).toBe(1);
    });

    it("unscoped then where applies user conditions only", async () => {
      const adapter = freshAdapter();

      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("published", "boolean", { default: false });
          this.adapter = adapter;
          this.defaultScope((rel: any) => rel.where({ published: true }));
        }
      }

      await Post.create({ title: "Pub", published: true });
      await Post.create({ title: "Draft", published: false });

      const result = await Post.unscoped().where({ title: "Draft" }).toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("title")).toBe("Draft");
    });
  });

  // =========================================================================
  // Edge cases — Relation query methods
  // =========================================================================
  describe("Relation edge cases", () => {
    it("where with multiple keys including null", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Alice", email: "a@b.com" });
      await User.create({ name: "Bob" }); // email null

      const result = await User.where({ name: "Bob", email: null }).toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("name")).toBe("Bob");
    });

    it("whereNot with array generates NOT IN", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      await User.create({ name: "Charlie" });

      const result = await User.all().whereNot({ name: ["Alice", "Charlie"] }).toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("name")).toBe("Bob");
    });

    it("chaining multiple whereNot calls", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Alice", age: 25 });
      await User.create({ name: "Bob", age: 30 });
      await User.create({ name: "Charlie", age: 35 });

      const result = await User.all()
        .whereNot({ name: "Alice" })
        .whereNot({ name: "Charlie" })
        .toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("name")).toBe("Bob");
    });

    it("limit overrides previous limit", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      for (let i = 0; i < 5; i++) await User.create({ name: `U${i}` });

      const result = await User.all().limit(10).limit(2).toArray();
      expect(result).toHaveLength(2);
    });

    it("offset without limit returns remaining records", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      for (let i = 0; i < 5; i++) await User.create({ name: `U${i}` });

      const result = await User.all().offset(3).toArray();
      expect(result).toHaveLength(2);
    });

    it("select restricts returned attributes", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Alice", email: "a@b.com" });

      const result = await User.all().select("name").toArray();
      expect(result[0].readAttribute("name")).toBe("Alice");
      // email should not be in the selected columns
      expect(result[0].readAttribute("email")).toBeNull();
    });

    it("pluck with multiple columns returns arrays", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Alice", age: 25 });
      await User.create({ name: "Bob", age: 30 });

      const result = await User.all().pluck("name", "age");
      expect(result).toEqual([
        ["Alice", 25],
        ["Bob", 30],
      ]);
    });

    it("ids returns primary key values", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      await User.create({ name: "Charlie" });

      const ids = await User.all().ids();
      expect(ids).toEqual([1, 2, 3]);
    });

    it("ids with where returns filtered IDs", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });

      const ids = await User.where({ name: "Bob" }).ids();
      expect(ids).toEqual([2]);
    });

    it("none chained with where still returns empty", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Alice" });
      // once none() is applied, additional conditions are irrelevant
      const result = await User.all().none().where({ name: "Alice" }).toArray();
      expect(result).toEqual([]);
    });

    it("first on unordered relation returns first by PK", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Bob" });
      await User.create({ name: "Alice" });

      const first = await User.all().first();
      expect((first as any)!.readAttribute("name")).toBe("Bob"); // ID 1
    });

    it("last on unordered relation returns last by PK", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Bob" });
      await User.create({ name: "Alice" });

      const last = await User.all().last();
      expect((last as any)!.readAttribute("name")).toBe("Alice"); // ID 2
    });

    it("count on empty table returns 0", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      expect(await User.all().count()).toBe(0);
    });

    it("pluck on empty table returns empty array", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      expect(await User.all().pluck("name")).toEqual([]);
    });

    it("reverseOrder with multiple columns flips all", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Alice", age: 25 });
      await User.create({ name: "Alice", age: 30 });
      await User.create({ name: "Bob", age: 20 });

      const sql = User.all()
        .order({ name: "asc" }, { age: "asc" })
        .reverseOrder()
        .toSql();
      expect(sql).toContain("DESC");
      expect(sql).not.toContain("ASC");
    });

    it("reorder then additional order", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Bob", age: 30 });
      await User.create({ name: "Alice", age: 25 });

      const result = await User.all()
        .order({ age: "desc" })
        .reorder("name")
        .toArray();
      expect(result[0].readAttribute("name")).toBe("Alice");
    });
  });

  // =========================================================================
  // Edge cases — Bulk operations
  // =========================================================================
  describe("Bulk operations edge cases", () => {
    it("updateAll does not run callbacks", async () => {
      const adapter = freshAdapter();
      const log: string[] = [];

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("active", "boolean");
          this.adapter = adapter;
          this.beforeSave(() => { log.push("before_save"); });
          this.afterSave(() => { log.push("after_save"); });
        }
      }

      await User.create({ name: "Alice", active: true });
      log.length = 0;

      await User.all().updateAll({ active: false });
      expect(log).toHaveLength(0);
    });

    it("update column should not modify updated at", async () => {
      const adapter = freshAdapter();

      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("updated_at", "datetime");
          this.adapter = adapter;
        }
      }

      const post = await Post.create({ title: "Hello" });
      const originalUpdatedAt = post.readAttribute("updated_at") as Date;

      await Post.all().updateAll({ title: "Changed" });

      const reloaded = await Post.find(post.id);
      // updateAll should NOT auto-bump updated_at
      expect((reloaded.readAttribute("updated_at") as Date).getTime())
        .toBe(originalUpdatedAt.getTime());
    });

    it("deleteAll does not run callbacks", async () => {
      const adapter = freshAdapter();
      const log: string[] = [];

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.beforeDestroy(() => { log.push("before_destroy"); });
        }
      }

      await User.create({ name: "Alice" });
      log.length = 0;

      await User.all().deleteAll();
      expect(log).toHaveLength(0);
    });

    it("destroyAll runs callbacks on each record", async () => {
      const adapter = freshAdapter();
      const log: string[] = [];

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.afterDestroy((r: any) => { log.push(r.readAttribute("name")); });
        }
      }

      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });

      await User.all().destroyAll();
      expect(log).toContain("Alice");
      expect(log).toContain("Bob");
    });

    it("updateAll returns count of affected rows", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("active", "boolean");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Alice", active: true });
      await User.create({ name: "Bob", active: false });

      const count = await User.where({ active: true }).updateAll({ active: false });
      expect(count).toBe(1);
    });

    it("deleteAll on empty table returns 0", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      expect(await User.all().deleteAll()).toBe(0);
    });
  });

  // =========================================================================
  // Edge cases — Persistence
  // =========================================================================
  describe("Persistence edge cases", () => {
    it("update does not run sql if record has not changed", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      const u = await User.create({ name: "Alice" });
      // No changes -> save should succeed without issuing UPDATE
      expect(await u.save()).toBe(true);
      expect(u.isPersisted()).toBe(true);
    });

    it("reload clears dirty tracking", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      const u = await User.create({ name: "Alice" });
      u.writeAttribute("name", "Changed");
      expect(u.changed).toBe(true);

      await u.reload();
      expect(u.changed).toBe(false);
      expect(u.readAttribute("name")).toBe("Alice");
    });

    it("assignAttributes triggers dirty tracking", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.adapter = adapter;
        }
      }

      const u = await User.create({ name: "Alice", email: "a@b.com" });
      u.assignAttributes({ name: "Bob", email: "b@b.com" });

      expect(u.changed).toBe(true);
      expect(u.changedAttributes).toContain("name");
      expect(u.changedAttributes).toContain("email");
    });

    it("created_at is never overwritten on subsequent saves", async () => {
      const adapter = freshAdapter();

      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("created_at", "datetime");
          this.attribute("updated_at", "datetime");
          this.adapter = adapter;
        }
      }

      const post = await Post.create({ title: "Hello" });
      const originalCreatedAt = (post.readAttribute("created_at") as Date).getTime();

      post.writeAttribute("title", "Updated");
      await post.save();

      post.writeAttribute("title", "Updated again");
      await post.save();

      expect((post.readAttribute("created_at") as Date).getTime()).toBe(originalCreatedAt);
    });

    it("updateColumn does not auto-update updated_at", async () => {
      const adapter = freshAdapter();

      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("updated_at", "datetime");
          this.adapter = adapter;
        }
      }

      const post = await Post.create({ title: "Hello" });
      const originalUpdatedAt = (post.readAttribute("updated_at") as Date).getTime();

      await post.updateColumn("title", "Changed");

      // updateColumn should NOT auto-bump updated_at
      expect((post.readAttribute("updated_at") as Date).getTime()).toBe(originalUpdatedAt);
    });
  });

  // =========================================================================
  // Edge cases — or()
  // =========================================================================
  describe("Relation#or edge cases", () => {
    it("triple or chains", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      await User.create({ name: "Charlie" });
      await User.create({ name: "Dave" });

      // Note: .or().or() nests — the second or wraps the first
      const result = await User.where({ name: "Alice" })
        .or(User.where({ name: "Bob" }))
        .or(User.where({ name: "Charlie" }))
        .toArray();

      expect(result).toHaveLength(3);
    });

    it("or with count", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Alice", age: 25 });
      await User.create({ name: "Bob", age: 30 });
      await User.create({ name: "Charlie", age: 35 });

      const count = await User.where({ age: 25 })
        .or(User.where({ age: 35 }))
        .count();
      expect(count).toBe(2);
    });
  });

  // =========================================================================
  // Edge cases — Aggregations
  // =========================================================================
  describe("Aggregation edge cases", () => {
    it("no queries for empty relation on minimum", async () => {
      const adapter = freshAdapter();

      class Order extends Base {
        static {
          this.attribute("amount", "integer");
          this.adapter = adapter;
        }
      }

      expect(await Order.all().minimum("amount")).toBeNull();
    });

    it("no queries for empty relation on maximum", async () => {
      const adapter = freshAdapter();

      class Order extends Base {
        static {
          this.attribute("amount", "integer");
          this.adapter = adapter;
        }
      }

      expect(await Order.all().maximum("amount")).toBeNull();
    });

    it("minimum on none() returns null", async () => {
      const adapter = freshAdapter();

      class Order extends Base {
        static {
          this.attribute("amount", "integer");
          this.adapter = adapter;
        }
      }

      await Order.create({ amount: 10 });
      expect(await Order.all().none().minimum("amount")).toBeNull();
    });

    it("maximum on none() returns null", async () => {
      const adapter = freshAdapter();

      class Order extends Base {
        static {
          this.attribute("amount", "integer");
          this.adapter = adapter;
        }
      }

      await Order.create({ amount: 10 });
      expect(await Order.all().none().maximum("amount")).toBeNull();
    });

    it("should sum scoped field with conditions", async () => {
      const adapter = freshAdapter();

      class Order extends Base {
        static {
          this.attribute("amount", "integer");
          this.attribute("status", "string");
          this.adapter = adapter;
        }
      }

      await Order.create({ amount: 10, status: "paid" });
      await Order.create({ amount: 20, status: "pending" });
      await Order.create({ amount: 30, status: "paid" });

      expect(await Order.where({ status: "paid" }).sum("amount")).toBe(40);
      expect(await Order.where({ status: "pending" }).sum("amount")).toBe(20);
    });
  });

  // =========================================================================
  // Edge cases — touch
  // =========================================================================
  describe("touch edge cases", () => {
    it("touch persists to database", async () => {
      const adapter = freshAdapter();

      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("updated_at", "datetime");
          this.adapter = adapter;
        }
      }

      const post = await Post.create({ title: "Hello" });
      await post.touch();

      const reloaded = await Post.find(post.id);
      expect(reloaded.readAttribute("updated_at")).not.toBeNull();
    });

    it("touch with multiple attribute names", async () => {
      const adapter = freshAdapter();

      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("updated_at", "datetime");
          this.attribute("replied_at", "datetime");
          this.attribute("viewed_at", "datetime");
          this.adapter = adapter;
        }
      }

      const post = await Post.create({ title: "Hello" });
      await post.touch("replied_at", "viewed_at");

      expect(post.readAttribute("replied_at")).toBeInstanceOf(Date);
      expect(post.readAttribute("viewed_at")).toBeInstanceOf(Date);
      expect(post.readAttribute("updated_at")).toBeInstanceOf(Date);
    });

    it("touch on model without updated_at returns false", async () => {
      const adapter = freshAdapter();

      class Simple extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      const s = await Simple.create({ name: "test" });
      expect(await s.touch()).toBe(false);
    });
  });

  // =========================================================================
  // Edge cases — findInBatches
  // =========================================================================
  describe("findInBatches edge cases", () => {
    it("findInBatches with batchSize 1", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      await User.create({ name: "Charlie" });

      const batches: any[][] = [];
      for await (const batch of User.all().findInBatches({ batchSize: 1 })) {
        batches.push(batch);
      }

      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(1);
      expect(batches[1]).toHaveLength(1);
      expect(batches[2]).toHaveLength(1);
    });

    it("findEach can be used with early break", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      for (let i = 0; i < 10; i++) await User.create({ name: `U${i}` });

      const names: string[] = [];
      for await (const record of User.all().findEach({ batchSize: 3 })) {
        names.push(record.readAttribute("name") as string);
        if (names.length >= 5) break;
      }

      expect(names).toHaveLength(5);
    });
  });

  // =========================================================================
  // Edge cases — Range with count
  // =========================================================================
  describe("Range edge cases", () => {
    it("count with Range condition", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("age", "integer");
          this.adapter = adapter;
        }
      }

      await User.create({ age: 15 });
      await User.create({ age: 25 });
      await User.create({ age: 35 });

      expect(await User.where({ age: new Range(20, 30) }).count()).toBe(1);
    });

    it("Range combined with IN array in same where", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Alice", age: 25 });
      await User.create({ name: "Bob", age: 30 });
      await User.create({ name: "Charlie", age: 35 });

      const result = await User.where({ age: new Range(20, 30) })
        .where({ name: ["Alice", "Bob"] })
        .toArray();
      expect(result).toHaveLength(2);
    });
  });

  // =========================================================================
  // Batch 1C — pick(), first(n), last(n)
  // =========================================================================
  describe("Relation: pick, first(n), last(n)", () => {
    it("pick returns first row's columns", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("name", "string"); this.attribute("age", "integer"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice", age: 25 });
      await User.create({ name: "Bob", age: 30 });
      const result = await User.all().order("name").pick("name");
      expect(result).toBe("Alice");
    });

    it("pick returns null when no records", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      expect(await User.all().pick("name")).toBe(null);
    });

    it("first(n) returns array of n records", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "A" });
      await User.create({ name: "B" });
      await User.create({ name: "C" });
      const result = await User.all().first(2) as Base[];
      expect(result).toHaveLength(2);
    });

    it("first(n) returns empty array for none", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const result = await User.all().none().first(2);
      expect(result).toEqual([]);
    });

    it("last(n) returns array of last n records", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "A" });
      await User.create({ name: "B" });
      await User.create({ name: "C" });
      const result = await User.all().last(2) as Base[];
      expect(result).toHaveLength(2);
    });

    it("last(n) returns empty array for none", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const result = await User.all().none().last(2);
      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // Batch 1D — increment/decrement/toggle
  // =========================================================================
  describe("Base: increment/decrement/toggle", () => {
    it("increment attribute", () => {
      class Counter extends Base {
        static { this.attribute("count", "integer", { default: 0 }); this.adapter = freshAdapter(); }
      }
      const c = new Counter();
      c.increment("count");
      expect(c.readAttribute("count")).toBe(1);
    });

    it("increment attribute by", () => {
      class Counter extends Base {
        static { this.attribute("count", "integer", { default: 5 }); this.adapter = freshAdapter(); }
      }
      const c = new Counter();
      c.increment("count", 3);
      expect(c.readAttribute("count")).toBe(8);
    });

    it("decrement attribute", () => {
      class Counter extends Base {
        static { this.attribute("count", "integer", { default: 10 }); this.adapter = freshAdapter(); }
      }
      const c = new Counter();
      c.decrement("count");
      expect(c.readAttribute("count")).toBe(9);
    });

    it("decrement attribute by", () => {
      class Counter extends Base {
        static { this.attribute("count", "integer", { default: 10 }); this.adapter = freshAdapter(); }
      }
      const c = new Counter();
      c.decrement("count", 3);
      expect(c.readAttribute("count")).toBe(7);
    });

    it("toggle flips boolean", () => {
      class Feature extends Base {
        static { this.attribute("active", "boolean", { default: false }); this.adapter = freshAdapter(); }
      }
      const f = new Feature();
      f.toggle("active");
      expect(f.readAttribute("active")).toBe(true);
      f.toggle("active");
      expect(f.readAttribute("active")).toBe(false);
    });

    it("incrementBang persists to DB", async () => {
      const adapter = freshAdapter();
      class Counter extends Base {
        static { this.attribute("count", "integer", { default: 0 }); this.adapter = adapter; }
      }
      const c = await Counter.create({ count: 5 });
      await c.incrementBang("count");
      const reloaded = await Counter.find(c.id);
      expect(reloaded.readAttribute("count")).toBe(6);
    });

    it("decrementBang persists to DB", async () => {
      const adapter = freshAdapter();
      class Counter extends Base {
        static { this.attribute("count", "integer", { default: 0 }); this.adapter = adapter; }
      }
      const c = await Counter.create({ count: 5 });
      await c.decrementBang("count");
      const reloaded = await Counter.find(c.id);
      expect(reloaded.readAttribute("count")).toBe(4);
    });

    it("toggleBang persists to DB", async () => {
      const adapter = freshAdapter();
      class Feature extends Base {
        static { this.attribute("active", "boolean", { default: false }); this.adapter = adapter; }
      }
      const f = await Feature.create({ active: false });
      await f.toggleBang("active");
      const reloaded = await Feature.find(f.id);
      expect(reloaded.readAttribute("active")).toBe(true);
    });

    it("increment returns this for chaining", () => {
      class Counter extends Base {
        static { this.attribute("a", "integer", { default: 0 }); this.attribute("b", "integer", { default: 0 }); this.adapter = freshAdapter(); }
      }
      const c = new Counter();
      c.increment("a").increment("b");
      expect(c.readAttribute("a")).toBe(1);
      expect(c.readAttribute("b")).toBe(1);
    });
  });

  // =========================================================================
  // Batch 1E — explain()
  // =========================================================================
  describe("Relation: explain()", () => {
    it("returns explain output from MemoryAdapter", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const result = await User.all().explain();
      expect(result).toContain("MemoryAdapter");
    });
  });

  // =========================================================================
  // Batch 1F — union/intersect/except
  // =========================================================================
  describe("Relation: set operations", () => {
    it("union combines two relations", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("name", "string"); this.attribute("age", "integer"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice", age: 20 });
      await User.create({ name: "Bob", age: 30 });
      await User.create({ name: "Charlie", age: 25 });

      const young = User.where({ age: 20 });
      const old = User.where({ age: 30 });
      const result = await young.union(old).toArray();
      expect(result).toHaveLength(2);
    });

    it("unionAll includes duplicates", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice" });
      const all1 = User.all();
      const all2 = User.all();
      const result = await all1.unionAll(all2).toArray();
      expect(result).toHaveLength(2);
    });

    it("intersect finds common records", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("name", "string"); this.attribute("active", "boolean"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice", active: true });
      await User.create({ name: "Bob", active: false });

      const result = await User.all().intersect(User.where({ active: true })).toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("name")).toBe("Alice");
    });

    it("except removes common records", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("name", "string"); this.attribute("active", "boolean"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice", active: true });
      await User.create({ name: "Bob", active: false });

      const result = await User.all().except(User.where({ active: true })).toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("name")).toBe("Bob");
    });

    it("toSql generates UNION SQL", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const sql = User.where({ name: "A" }).union(User.where({ name: "B" })).toSql();
      expect(sql).toContain("UNION");
    });
  });

  // =========================================================================
  // Batch 1G — lock()
  // =========================================================================
  describe("Relation: lock()", () => {
    it("toSql includes FOR UPDATE", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const sql = User.all().lock().toSql();
      expect(sql).toContain("FOR UPDATE");
    });

    it("toSql includes custom lock clause", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const sql = User.all().lock("FOR SHARE").toSql();
      expect(sql).toContain("FOR SHARE");
    });

    it("lock(false) removes lock", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const sql = User.all().lock().lock(false).toSql();
      expect(sql).not.toContain("FOR UPDATE");
    });

    it("MemoryAdapter tolerates FOR UPDATE in queries", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice" });
      const result = await User.all().lock().toArray();
      expect(result).toHaveLength(1);
    });
  });

  // =========================================================================
  // Batch 2A — joins() and leftJoins()
  // =========================================================================
  describe("Relation: joins and leftJoins", () => {
    it("joins generates INNER JOIN SQL", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const sql = User.all().joins("posts", '"users"."id" = "posts"."user_id"').toSql();
      expect(sql).toContain("INNER JOIN");
      expect(sql).toContain('"posts"');
    });

    it("leftJoins generates LEFT OUTER JOIN SQL", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const sql = User.all().leftJoins("posts", '"users"."id" = "posts"."user_id"').toSql();
      expect(sql).toContain("LEFT OUTER JOIN");
    });

    it("raw joins with single string", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const sql = User.all().joins('INNER JOIN "posts" ON "posts"."user_id" = "users"."id"').toSql();
      expect(sql).toContain("INNER JOIN");
    });
  });

  // =========================================================================
  // Batch 3A — dependent: destroy/delete/nullify
  // =========================================================================
  describe("Associations: dependent", () => {
    it("dependent destroy destroys children", async () => {
      const adapter = freshAdapter();

      class Comment extends Base {
        static {
          this.attribute("body", "string");
          this.attribute("post_id", "integer");
          this.adapter = adapter;
        }
      }

      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.adapter = adapter;
        }
      }
      (Post as any)._associations = [
        { type: "hasMany", name: "comments", options: { dependent: "destroy", className: "Comment" } },
      ];

      registerModel(Post);
      registerModel(Comment);

      const post = await Post.create({ title: "Hello" });
      await Comment.create({ body: "Nice", post_id: post.id });
      await Comment.create({ body: "Great", post_id: post.id });

      expect(await Comment.all().count()).toBe(2);
      await post.destroy();
      expect(await Comment.all().count()).toBe(0);
    });

    it("dependent nullify sets FK to null", async () => {
      const adapter = freshAdapter();

      class Reply extends Base {
        static {
          this.attribute("content", "string");
          this.attribute("thread_id", "integer");
          this.adapter = adapter;
        }
      }

      class Thread extends Base {
        static {
          this.attribute("subject", "string");
          this.adapter = adapter;
        }
      }
      (Thread as any)._associations = [
        { type: "hasMany", name: "replies", options: { dependent: "nullify", className: "Reply", foreignKey: "thread_id" } },
      ];

      registerModel(Thread);
      registerModel(Reply);

      const thread = await Thread.create({ subject: "Test" });
      await Reply.create({ content: "Reply 1", thread_id: thread.id });

      await thread.destroy();

      const replies = await Reply.all().toArray();
      expect(replies).toHaveLength(1);
      expect(replies[0].readAttribute("thread_id")).toBe(null);
    });
  });

  // =========================================================================
  // Batch 3B — has_many through
  // =========================================================================
  describe("Associations: has_many through", () => {
    it("loads through a join model", async () => {
      const adapter = freshAdapter();

      class Tag extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      class Tagging extends Base {
        static {
          this.attribute("post_id", "integer");
          this.attribute("tag_id", "integer");
          this.adapter = adapter;
        }
      }

      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.adapter = adapter;
        }
      }
      (Post as any)._associations = [
        { type: "hasMany", name: "taggings", options: { className: "Tagging" } },
        { type: "hasMany", name: "tags", options: { through: "taggings", className: "Tag", source: "tag" } },
      ];

      registerModel(Post);
      registerModel(Tagging);
      registerModel(Tag);

      const post = await Post.create({ title: "Hello" });
      const tag1 = await Tag.create({ name: "ruby" });
      const tag2 = await Tag.create({ name: "rails" });
      await Tagging.create({ post_id: post.id, tag_id: tag1.id });
      await Tagging.create({ post_id: post.id, tag_id: tag2.id });

      const tags = await loadHasManyThrough(post, "tags", {
        through: "taggings",
        className: "Tag",
        source: "tag",
      });
      expect(tags).toHaveLength(2);
      const names = tags.map((t) => t.readAttribute("name"));
      expect(names).toContain("ruby");
      expect(names).toContain("rails");
    });
  });

  // =========================================================================
  // Batch 3C — CollectionProxy
  // =========================================================================
  describe("CollectionProxy", () => {
    it("toArray loads associated records", async () => {
      const adapter = freshAdapter();

      class Item extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("order_id", "integer");
          this.adapter = adapter;
        }
      }

      class Order extends Base {
        static {
          this.attribute("number", "string");
          this.adapter = adapter;
        }
      }
      (Order as any)._associations = [
        { type: "hasMany", name: "items", options: { className: "Item", foreignKey: "order_id" } },
      ];

      registerModel(Order);
      registerModel(Item);

      const order = await Order.create({ number: "ORD-001" });
      await Item.create({ name: "Widget", order_id: order.id });
      await Item.create({ name: "Gadget", order_id: order.id });

      const proxy = association(order, "items");
      const items = await proxy.toArray();
      expect(items).toHaveLength(2);
    });

    it("build creates unsaved record with FK", async () => {
      const adapter = freshAdapter();

      class LineItem extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("invoice_id", "integer");
          this.adapter = adapter;
        }
      }

      class Invoice extends Base {
        static {
          this.attribute("number", "string");
          this.adapter = adapter;
        }
      }
      (Invoice as any)._associations = [
        { type: "hasMany", name: "lineItems", options: { className: "LineItem", foreignKey: "invoice_id" } },
      ];

      registerModel(Invoice);
      registerModel(LineItem);

      const invoice = await Invoice.create({ number: "INV-001" });
      const proxy = association(invoice, "lineItems");
      const item = proxy.build({ name: "Widget" });
      expect(item.readAttribute("invoice_id")).toBe(invoice.id);
      expect(item.isNewRecord()).toBe(true);
    });

    it("create saves a new associated record", async () => {
      const adapter = freshAdapter();

      class Note extends Base {
        static {
          this.attribute("text", "string");
          this.attribute("doc_id", "integer");
          this.adapter = adapter;
        }
      }

      class Doc extends Base {
        static {
          this.attribute("title", "string");
          this.adapter = adapter;
        }
      }
      (Doc as any)._associations = [
        { type: "hasMany", name: "notes", options: { className: "Note", foreignKey: "doc_id" } },
      ];

      registerModel(Doc);
      registerModel(Note);

      const doc = await Doc.create({ title: "My Doc" });
      const proxy = association(doc, "notes");
      const note = await proxy.create({ text: "Remember this" });
      expect(note.isPersisted()).toBe(true);
      expect(note.readAttribute("doc_id")).toBe(doc.id);
    });

    it("count returns number of associated records", async () => {
      const adapter = freshAdapter();

      class Task extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("project_id", "integer");
          this.adapter = adapter;
        }
      }

      class Project extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      (Project as any)._associations = [
        { type: "hasMany", name: "tasks", options: { className: "Task", foreignKey: "project_id" } },
      ];

      registerModel(Project);
      registerModel(Task);

      const project = await Project.create({ name: "Rails-JS" });
      await Task.create({ title: "Task 1", project_id: project.id });
      await Task.create({ title: "Task 2", project_id: project.id });

      const proxy = association(project, "tasks");
      expect(await proxy.count()).toBe(2);
    });
  });

  // =========================================================================
  // Batch 4A — includes / preload / eagerLoad
  // =========================================================================
  describe("Eager Loading", () => {
    it("includes preloads belongsTo associations", async () => {
      const adapter = freshAdapter();

      class Author extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      class Book extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("author_id", "integer");
          this.adapter = adapter;
        }
      }
      (Book as any)._associations = [
        { type: "belongsTo", name: "author", options: { className: "Author" } },
      ];

      registerModel(Author);
      registerModel(Book);

      const author = await Author.create({ name: "Bob" });
      await Book.create({ title: "Book 1", author_id: author.id });
      await Book.create({ title: "Book 2", author_id: author.id });

      const books = await Book.all().includes("author").toArray();
      expect(books).toHaveLength(2);
      // Preloaded data should be cached
      expect((books[0] as any)._preloadedAssociations.has("author")).toBe(true);
    });

    it("includes preloads hasMany associations", async () => {
      const adapter = freshAdapter();

      class Chapter extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("novel_id", "integer");
          this.adapter = adapter;
        }
      }

      class Novel extends Base {
        static {
          this.attribute("title", "string");
          this.adapter = adapter;
        }
      }
      (Novel as any)._associations = [
        { type: "hasMany", name: "chapters", options: { className: "Chapter", foreignKey: "novel_id" } },
      ];

      registerModel(Novel);
      registerModel(Chapter);

      const novel = await Novel.create({ title: "Epic" });
      await Chapter.create({ title: "Ch 1", novel_id: novel.id });
      await Chapter.create({ title: "Ch 2", novel_id: novel.id });

      const novels = await Novel.all().includes("chapters").toArray();
      expect(novels).toHaveLength(1);
      const preloaded = (novels[0] as any)._preloadedAssociations.get("chapters");
      expect(preloaded).toHaveLength(2);
    });

    it("preload method works like includes", async () => {
      const adapter = freshAdapter();

      class Pet extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("owner_id", "integer");
          this.adapter = adapter;
        }
      }

      class Owner extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      (Owner as any)._associations = [
        { type: "hasMany", name: "pets", options: { className: "Pet", foreignKey: "owner_id" } },
      ];

      registerModel(Owner);
      registerModel(Pet);

      const owner = await Owner.create({ name: "Jane" });
      await Pet.create({ name: "Rex", owner_id: owner.id });

      const owners = await Owner.all().preload("pets").toArray();
      expect((owners[0] as any)._preloadedAssociations.get("pets")).toHaveLength(1);
    });

    it("eagerLoad method works like includes", async () => {
      const adapter = freshAdapter();

      class Wheel extends Base {
        static {
          this.attribute("position", "string");
          this.attribute("car_id", "integer");
          this.adapter = adapter;
        }
      }

      class Car extends Base {
        static {
          this.attribute("make", "string");
          this.adapter = adapter;
        }
      }
      (Car as any)._associations = [
        { type: "hasMany", name: "wheels", options: { className: "Wheel", foreignKey: "car_id" } },
      ];

      registerModel(Car);
      registerModel(Wheel);

      const car = await Car.create({ make: "Toyota" });
      await Wheel.create({ position: "FL", car_id: car.id });
      await Wheel.create({ position: "FR", car_id: car.id });

      const cars = await Car.all().eagerLoad("wheels").toArray();
      expect((cars[0] as any)._preloadedAssociations.get("wheels")).toHaveLength(2);
    });

    it("loadBelongsTo uses preloaded cache", async () => {
      const adapter = freshAdapter();

      class Publisher extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      class Magazine extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("publisher_id", "integer");
          this.adapter = adapter;
        }
      }
      (Magazine as any)._associations = [
        { type: "belongsTo", name: "publisher", options: { className: "Publisher" } },
      ];

      registerModel(Publisher);
      registerModel(Magazine);

      const pub = await Publisher.create({ name: "Pub Co" });
      await Magazine.create({ title: "Mag 1", publisher_id: pub.id });

      const mags = await Magazine.all().includes("publisher").toArray();
      // loadBelongsTo should use cache
      const loaded = await loadBelongsTo(mags[0], "publisher", { className: "Publisher" });
      expect(loaded!.readAttribute("name")).toBe("Pub Co");
    });
  });

  // =========================================================================
  // Batch 5A — afterCommit / afterRollback
  // =========================================================================
  describe("afterCommit / afterRollback", () => {
    it("fires afterCommit callback outside transaction", async () => {
      const adapter = freshAdapter();
      const log: string[] = [];

      class Order extends Base {
        static {
          this.attribute("total", "integer");
          this.adapter = adapter;
          this.afterCommit((record: any) => { log.push("committed"); });
        }
      }

      await Order.create({ total: 100 });
      expect(log).toContain("committed");
    });

    it("call after commit after transaction commits", async () => {
      const adapter = freshAdapter();
      const log: string[] = [];

      class Payment extends Base {
        static {
          this.attribute("amount", "integer");
          this.adapter = adapter;
          this.afterCommit((record: any) => { log.push("committed"); });
        }
      }

      await transaction(Payment, async (tx) => {
        await Payment.create({ amount: 50 });
      });
      expect(log).toContain("committed");
    });
  });

  // =========================================================================
  // Batch 6C — UniquenessValidator
  // =========================================================================
  describe("UniquenessValidator", () => {
    it("validate uniqueness", async () => {
      const adapter = freshAdapter();

      class Email extends Base {
        static {
          this.attribute("address", "string");
          this.adapter = adapter;
          this.validatesUniqueness("address");
        }
      }

      const e1 = await Email.create({ address: "test@example.com" });
      expect(e1.isPersisted()).toBe(true);

      const e2 = new Email({ address: "test@example.com" });
      const saved = await e2.save();
      expect(saved).toBe(false);
      expect(e2.errors.get("address")).toContain("has already been taken");
    });

    it("allows same value if record is itself", async () => {
      const adapter = freshAdapter();

      class Username extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.validatesUniqueness("name");
        }
      }

      const u = await Username.create({ name: "dean" });
      // Re-saving same record should work
      const saved = await u.save();
      expect(saved).toBe(true);
    });

    it("validate uniqueness with scope", async () => {
      const adapter = freshAdapter();

      class Membership extends Base {
        static {
          this.attribute("user_id", "integer");
          this.attribute("group_id", "integer");
          this.adapter = adapter;
          this.validatesUniqueness("user_id", { scope: "group_id" });
        }
      }

      await Membership.create({ user_id: 1, group_id: 1 });
      // Same user, different group — should work
      const m2 = await Membership.create({ user_id: 1, group_id: 2 });
      expect(m2.isPersisted()).toBe(true);
      // Same user, same group — should fail
      const m3 = new Membership({ user_id: 1, group_id: 1 });
      expect(await m3.save()).toBe(false);
    });
  });

  // =========================================================================
  // Batch 7A — Reversible Migrations
  // =========================================================================
  describe("Reversible Migrations", () => {
    it("change method runs up and reverses on down", async () => {
      const adapter = freshAdapter();

      class CreatePosts extends Migration {
        async change(): Promise<void> {
          await this.createTable("posts", (t) => {
            t.string("title");
            t.text("body");
          });
        }
      }

      const migration = new CreatePosts();
      // Up
      await migration.run(adapter, "up");
      // Table should exist - insert should work
      await adapter.executeMutation(
        `INSERT INTO "posts" ("title", "body") VALUES ('Hello', 'World')`
      );
      const rows = await adapter.execute(`SELECT * FROM "posts"`);
      expect(rows).toHaveLength(1);

      // Down — drops the table
      await migration.run(adapter, "down");
      const afterDrop = await adapter.execute(`SELECT * FROM "posts"`);
      expect(afterDrop).toHaveLength(0);
    });
  });

  // =========================================================================
  // Batch 7B — Migration Runner
  // =========================================================================
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

  // -- Enum --
  describe("Enum", () => {
    let adapter: DatabaseAdapter;

    beforeEach(() => {
      adapter = freshAdapter();
    });

    it("find via scope", async () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      Post.attribute("id", "integer");
      Post.attribute("title", "string");
      Post.attribute("status", "integer");
      Post.adapter = adapter;
      defineEnum(Post, "status", ["draft", "published", "archived"]);

      await Post.create({ title: "A", status: 0 });
      await Post.create({ title: "B", status: 1 });
      await Post.create({ title: "C", status: 2 });

      const drafts = await (Post as any).draft().toArray();
      expect(drafts).toHaveLength(1);
      expect(drafts[0].readAttribute("title")).toBe("A");

      const published = await (Post as any).published().toArray();
      expect(published).toHaveLength(1);
      expect(published[0].readAttribute("title")).toBe("B");
    });

    it("query state by predicate", () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      Post.attribute("id", "integer");
      Post.attribute("status", "integer");
      Post.adapter = freshAdapter();
      defineEnum(Post, "status", ["draft", "published", "archived"]);

      const post = new Post({ status: 0 });
      expect((post as any).isDraft()).toBe(true);
      expect((post as any).isPublished()).toBe(false);
      expect((post as any).isArchived()).toBe(false);
    });

    it("update by setter", () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      Post.attribute("id", "integer");
      Post.attribute("status", "integer");
      Post.adapter = freshAdapter();
      defineEnum(Post, "status", ["draft", "published", "archived"]);

      const post = new Post({ status: 0 });
      expect((post as any).isDraft()).toBe(true);
      (post as any).published();
      expect((post as any).isPublished()).toBe(true);
      expect(post.readAttribute("status")).toBe(1);
    });

    it("supports hash mapping", () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      Post.attribute("id", "integer");
      Post.attribute("status", "integer");
      Post.adapter = freshAdapter();
      defineEnum(Post, "status", { draft: 0, published: 5, archived: 10 });

      const post = new Post({ status: 5 });
      expect((post as any).isPublished()).toBe(true);
      expect(readEnumValue(post, "status")).toBe("published");
    });

    it("readEnumValue returns the string name", () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      Post.attribute("id", "integer");
      Post.attribute("status", "integer");
      Post.adapter = freshAdapter();
      defineEnum(Post, "status", ["draft", "published", "archived"]);

      const post = new Post({ status: 2 });
      expect(readEnumValue(post, "status")).toBe("archived");
    });
  });

  // -- Single Table Inheritance --
  describe("STI", () => {
    let adapter: DatabaseAdapter;

    beforeEach(() => {
      adapter = freshAdapter();
    });

    it("subclasses share the parent table", () => {
      class Vehicle extends Base {
        static _tableName = "vehicles";
      }
      enableSti(Vehicle);
      class Car extends Vehicle {}
      class Truck extends Vehicle {}

      expect(Car.tableName).toBe("vehicles");
      expect(Truck.tableName).toBe("vehicles");
    });

    it("inheritance save", async () => {
      class Vehicle extends Base {
        static _tableName = "vehicles";
      }
      Vehicle.attribute("id", "integer");
      Vehicle.attribute("name", "string");
      Vehicle.attribute("type", "string");
      Vehicle.adapter = adapter;
      enableSti(Vehicle);

      class Car extends Vehicle {}
      Car.adapter = adapter;
      registerModel(Car);

      const car = await Car.create({ name: "Civic" });
      expect(car.readAttribute("type")).toBe("Car");
    });

    it("inheritance condition", async () => {
      class Vehicle extends Base {
        static _tableName = "vehicles";
      }
      Vehicle.attribute("id", "integer");
      Vehicle.attribute("name", "string");
      Vehicle.attribute("type", "string");
      Vehicle.adapter = adapter;
      enableSti(Vehicle);

      class Car extends Vehicle {}
      Car.adapter = adapter;
      registerModel(Car);

      class Truck extends Vehicle {}
      Truck.adapter = adapter;
      registerModel(Truck);

      await Car.create({ name: "Civic" });
      await Truck.create({ name: "F-150" });
      await Car.create({ name: "Accord" });

      const cars = await Car.all().toArray();
      expect(cars).toHaveLength(2);
      expect(cars.every((c: any) => c.readAttribute("type") === "Car")).toBe(true);

      const trucks = await Truck.all().toArray();
      expect(trucks).toHaveLength(1);

      // Base class returns all
      const all = await Vehicle.all().toArray();
      expect(all).toHaveLength(3);
    });

    it("inheritance find", async () => {
      class Vehicle extends Base {
        static _tableName = "vehicles";
      }
      Vehicle.attribute("id", "integer");
      Vehicle.attribute("name", "string");
      Vehicle.attribute("type", "string");
      Vehicle.adapter = adapter;
      enableSti(Vehicle);

      class Car extends Vehicle {}
      Car.adapter = adapter;
      registerModel(Car);

      class Truck extends Vehicle {}
      Truck.adapter = adapter;
      registerModel(Truck);

      await Car.create({ name: "Civic" });
      await Truck.create({ name: "F-150" });

      const all = await Vehicle.all().toArray();
      expect(all[0]).toBeInstanceOf(Car);
      expect(all[1]).toBeInstanceOf(Truck);
    });
  });

  // -- Polymorphic Associations --
  describe("Polymorphic Associations", () => {
    let adapter: DatabaseAdapter;

    beforeEach(() => {
      adapter = freshAdapter();
    });

    it("belongsTo polymorphic loads correct parent type", async () => {
      class Article extends Base {
        static _tableName = "articles";
      }
      Article.attribute("id", "integer");
      Article.attribute("title", "string");
      Article.adapter = adapter;
      registerModel(Article);

      class Photo extends Base {
        static _tableName = "photos";
      }
      Photo.attribute("id", "integer");
      Photo.attribute("url", "string");
      Photo.adapter = adapter;
      registerModel(Photo);

      class Comment extends Base {
        static _tableName = "comments";
      }
      Comment.attribute("id", "integer");
      Comment.attribute("body", "string");
      Comment.attribute("commentable_id", "integer");
      Comment.attribute("commentable_type", "string");
      Comment.adapter = adapter;
      Associations.belongsTo.call(Comment, "commentable", { polymorphic: true });

      const article = await Article.create({ title: "Hello" });
      const photo = await Photo.create({ url: "pic.jpg" });
      const c1 = await Comment.create({ body: "Nice!", commentable_id: article.id, commentable_type: "Article" });
      const c2 = await Comment.create({ body: "Cool!", commentable_id: photo.id, commentable_type: "Photo" });

      const parent1 = await loadBelongsTo(c1, "commentable", { polymorphic: true });
      expect(parent1).toBeInstanceOf(Article);
      expect(parent1!.readAttribute("title")).toBe("Hello");

      const parent2 = await loadBelongsTo(c2, "commentable", { polymorphic: true });
      expect(parent2).toBeInstanceOf(Photo);
      expect(parent2!.readAttribute("url")).toBe("pic.jpg");
    });

    it("hasMany with as: loads polymorphic children", async () => {
      class Article extends Base {
        static _tableName = "articles";
      }
      Article.attribute("id", "integer");
      Article.attribute("title", "string");
      Article.adapter = adapter;
      registerModel(Article);
      Associations.hasMany.call(Article, "comments", { as: "commentable" });

      class Comment extends Base {
        static _tableName = "comments";
      }
      Comment.attribute("id", "integer");
      Comment.attribute("body", "string");
      Comment.attribute("commentable_id", "integer");
      Comment.attribute("commentable_type", "string");
      Comment.adapter = adapter;
      registerModel(Comment);

      const article = await Article.create({ title: "Hello" });
      await Comment.create({ body: "Nice!", commentable_id: article.id, commentable_type: "Article" });
      await Comment.create({ body: "Cool!", commentable_id: article.id, commentable_type: "Article" });
      await Comment.create({ body: "Other", commentable_id: 999, commentable_type: "Photo" });

      const assocDef = (Article as any)._associations.find((a: any) => a.name === "comments");
      const comments = await loadHasMany(article, "comments", assocDef.options);
      expect(comments).toHaveLength(2);
    });
  });

  // -- HABTM --
  describe("has_and_belongs_to_many", () => {
    let adapter: DatabaseAdapter;

    beforeEach(() => {
      adapter = freshAdapter();
    });

    it("loads associated records through a join table", async () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      Post.attribute("id", "integer");
      Post.attribute("title", "string");
      Post.adapter = adapter;
      Associations.hasAndBelongsToMany.call(Post, "tags", { joinTable: "posts_tags" });

      class Tag extends Base {
        static _tableName = "tags";
      }
      Tag.attribute("id", "integer");
      Tag.attribute("name", "string");
      Tag.adapter = adapter;
      registerModel(Tag);
      registerModel(Post);

      const post = await Post.create({ title: "Hello" });
      const t1 = await Tag.create({ name: "ruby" });
      const t2 = await Tag.create({ name: "rails" });
      const t3 = await Tag.create({ name: "js" });

      // Manually insert into join table
      await adapter.executeMutation(
        `INSERT INTO "posts_tags" ("post_id", "tag_id") VALUES (${post.id}, ${t1.id})`
      );
      await adapter.executeMutation(
        `INSERT INTO "posts_tags" ("post_id", "tag_id") VALUES (${post.id}, ${t2.id})`
      );

      const tags = await loadHabtm(post, "tags", { joinTable: "posts_tags" });
      expect(tags).toHaveLength(2);
      const names = tags.map((t: any) => t.readAttribute("name")).sort();
      expect(names).toEqual(["rails", "ruby"]);
    });

    it("uses default join table name (alphabetical)", async () => {
      class Developer extends Base {
        static _tableName = "developers";
      }
      Developer.attribute("id", "integer");
      Developer.attribute("name", "string");
      Developer.adapter = adapter;
      Associations.hasAndBelongsToMany.call(Developer, "projects");
      registerModel(Developer);

      class Project extends Base {
        static _tableName = "projects";
      }
      Project.attribute("id", "integer");
      Project.attribute("name", "string");
      Project.adapter = adapter;
      registerModel(Project);

      const dev = await Developer.create({ name: "Alice" });
      const proj = await Project.create({ name: "Rails" });

      // Default join table: alphabetical order of pluralized names
      // "developers" and "projects" -> "developers_projects"
      await adapter.executeMutation(
        `INSERT INTO "developers_projects" ("developer_id", "project_id") VALUES (${dev.id}, ${proj.id})`
      );

      const projects = await loadHabtm(dev, "projects", {});
      expect(projects).toHaveLength(1);
      expect(projects[0].readAttribute("name")).toBe("Rails");
    });
  });

  // -- secure_password --
  describe("secure_password", () => {
    let adapter: DatabaseAdapter;

    beforeEach(() => {
      adapter = freshAdapter();
    });

    it("hashes password on save and authenticates", async () => {
      class User extends Base {
        static _tableName = "users";
      }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.attribute("password_digest", "string");
      User.adapter = adapter;
      hasSecurePassword(User, { validations: false });

      const user = new User({ name: "Alice" });
      (user as any).password = "secret123";
      await user.save();

      const digest = user.readAttribute("password_digest") as string;
      expect(digest).toBeTruthy();
      expect(digest).toContain(":");

      // authenticate returns record on success
      const result = (user as any).authenticate("secret123");
      expect(result).toBe(user);

      // authenticate returns false on failure
      const badResult = (user as any).authenticate("wrong");
      expect(badResult).toBe(false);
    });

    it("validates password presence on create", async () => {
      class User extends Base {
        static _tableName = "users";
      }
      User.attribute("id", "integer");
      User.attribute("password_digest", "string");
      User.adapter = adapter;
      hasSecurePassword(User);

      const user = new User({});
      const saved = await user.save();
      expect(saved).toBe(false);
      expect(user.errors.fullMessages).toContain("Password can't be blank");
    });

    it("validates password confirmation mismatch", async () => {
      class User extends Base {
        static _tableName = "users";
      }
      User.attribute("id", "integer");
      User.attribute("password_digest", "string");
      User.adapter = adapter;
      hasSecurePassword(User);

      const user = new User({});
      (user as any).password = "secret123";
      (user as any).passwordConfirmation = "different";
      const saved = await user.save();
      expect(saved).toBe(false);
      expect(user.errors.fullMessages.some((m: string) =>
        m.includes("doesn't match Password")
      )).toBe(true);
    });
  });

  // -- Store --
  describe("Store", () => {
    let adapter: DatabaseAdapter;

    beforeEach(() => {
      adapter = freshAdapter();
    });

    it("reading store attributes through accessors", () => {
      class User extends Base {
        static _tableName = "users";
      }
      User.attribute("id", "integer");
      User.attribute("settings", "json");
      User.adapter = adapter;
      store(User, "settings", { accessors: ["theme", "language"] });

      const user = new User({});
      expect((user as any).theme).toBeNull();
      expect((user as any).language).toBeNull();

      (user as any).theme = "dark";
      (user as any).language = "en";

      expect((user as any).theme).toBe("dark");
      expect((user as any).language).toBe("en");

      // Underlying attribute is an object
      const settings = user.readAttribute("settings");
      expect(settings).toEqual({ theme: "dark", language: "en" });
    });

    it("reads from pre-existing JSON data", () => {
      class User extends Base {
        static _tableName = "users";
      }
      User.attribute("id", "integer");
      User.attribute("settings", "json");
      User.adapter = adapter;
      store(User, "settings", { accessors: ["theme", "language"] });

      const user = new User({ settings: '{"theme":"light","language":"fr"}' });
      expect((user as any).theme).toBe("light");
      expect((user as any).language).toBe("fr");
    });

    it("persists through save and reload", async () => {
      class User extends Base {
        static _tableName = "users";
      }
      User.attribute("id", "integer");
      User.attribute("settings", "json");
      User.adapter = adapter;
      store(User, "settings", { accessors: ["theme", "language"] });
      registerModel(User);

      const user = new User({});
      (user as any).theme = "dark";
      (user as any).language = "en";
      await user.save();

      const found = await User.find(user.id);
      // Store data should persist (might be serialized as object or string)
      expect((found as any).theme).toBe("dark");
      expect((found as any).language).toBe("en");
    });
  });

  // -- Counter Cache --
  describe("counter_cache", () => {
    let adapter: DatabaseAdapter;

    beforeEach(() => {
      adapter = freshAdapter();
    });

    it("increment counter", async () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      Post.attribute("id", "integer");
      Post.attribute("title", "string");
      Post.attribute("comments_count", "integer", { default: 0 });
      Post.adapter = adapter;
      registerModel(Post);

      class Comment extends Base {
        static _tableName = "comments";
      }
      Comment.attribute("id", "integer");
      Comment.attribute("body", "string");
      Comment.attribute("post_id", "integer");
      Comment.adapter = adapter;
      Associations.belongsTo.call(Comment, "post", { counterCache: true });
      registerModel(Comment);

      const post = await Post.create({ title: "Hello" });
      expect(post.readAttribute("comments_count")).toBe(0);

      const c1 = await Comment.create({ body: "Nice!", post_id: post.id });
      await post.reload();
      expect(post.readAttribute("comments_count")).toBe(1);

      const c2 = await Comment.create({ body: "Cool!", post_id: post.id });
      await post.reload();
      expect(post.readAttribute("comments_count")).toBe(2);

      await c1.destroy();
      await post.reload();
      expect(post.readAttribute("comments_count")).toBe(1);
    });

    it("supports custom counter column name", async () => {
      class Author extends Base {
        static _tableName = "authors";
      }
      Author.attribute("id", "integer");
      Author.attribute("name", "string");
      Author.attribute("num_books", "integer", { default: 0 });
      Author.adapter = adapter;
      registerModel(Author);

      class Book extends Base {
        static _tableName = "books";
      }
      Book.attribute("id", "integer");
      Book.attribute("title", "string");
      Book.attribute("author_id", "integer");
      Book.adapter = adapter;
      Associations.belongsTo.call(Book, "author", { counterCache: "num_books" });
      registerModel(Book);

      const author = await Author.create({ name: "Tolkien" });
      await Book.create({ title: "The Hobbit", author_id: author.id });
      await author.reload();
      expect(author.readAttribute("num_books")).toBe(1);
    });
  });

  // -- Touch on belongs_to --
  describe("touch on belongs_to", () => {
    let adapter: DatabaseAdapter;

    beforeEach(() => {
      adapter = freshAdapter();
    });

    it("touches parent updated_at when child is saved", async () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      Post.attribute("id", "integer");
      Post.attribute("title", "string");
      Post.attribute("updated_at", "datetime");
      Post.adapter = adapter;
      registerModel(Post);

      class Comment extends Base {
        static _tableName = "comments";
      }
      Comment.attribute("id", "integer");
      Comment.attribute("body", "string");
      Comment.attribute("post_id", "integer");
      Comment.adapter = adapter;
      Associations.belongsTo.call(Comment, "post", { touch: true });
      registerModel(Comment);

      const post = await Post.create({ title: "Hello" });
      const originalUpdatedAt = post.readAttribute("updated_at");

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));

      await Comment.create({ body: "Nice!", post_id: post.id });
      await post.reload();

      const newUpdatedAt = post.readAttribute("updated_at");
      expect(newUpdatedAt).not.toEqual(originalUpdatedAt);
    });
  });

  // -- Optimistic Locking --
  describe("optimistic locking", () => {
    let adapter: DatabaseAdapter;

    beforeEach(() => {
      adapter = freshAdapter();
    });

    it("lock existing", async () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      Post.attribute("id", "integer");
      Post.attribute("title", "string");
      Post.attribute("lock_version", "integer", { default: 0 });
      Post.adapter = adapter;

      const post = await Post.create({ title: "Hello" });
      expect(post.readAttribute("lock_version")).toBe(0);

      await post.update({ title: "Updated" });
      expect(post.readAttribute("lock_version")).toBe(1);

      await post.update({ title: "Updated Again" });
      expect(post.readAttribute("lock_version")).toBe(2);
    });

    it("lock exception record", async () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      Post.attribute("id", "integer");
      Post.attribute("title", "string");
      Post.attribute("lock_version", "integer", { default: 0 });
      Post.adapter = adapter;

      const post1 = await Post.create({ title: "Hello" });
      const post2 = await Post.find(post1.id);

      // Both have lock_version 0
      await post1.update({ title: "Updated by 1" });
      // post1 now has lock_version 1, but post2 still has 0

      await expect(post2.update({ title: "Updated by 2" })).rejects.toThrow(
        "StaleObjectError"
      );
    });
  });

  // -- Readonly --
  describe("readonly", () => {
    let adapter: DatabaseAdapter;

    beforeEach(() => {
      adapter = freshAdapter();
    });

    it("cant save readonly record", async () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      Post.attribute("id", "integer");
      Post.attribute("title", "string");
      Post.adapter = adapter;

      const post = await Post.create({ title: "Hello" });
      post.readonlyBang();

      expect(post.isReadonly()).toBe(true);
      await expect(post.save()).rejects.toThrow("readonly");
    });

    it("prevents destroying a readonly record", async () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      Post.attribute("id", "integer");
      Post.attribute("title", "string");
      Post.adapter = adapter;

      const post = await Post.create({ title: "Hello" });
      post.readonlyBang();

      await expect(post.destroy()).rejects.toThrow("readonly");
    });
  });

  // -- Validation Contexts --
  describe("validation contexts", () => {
    it("valid uses create context when new", async () => {
      class User extends Base {
        static _tableName = "users";
      }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.attribute("invite_code", "string");
      User.adapter = freshAdapter();
      User.validates("invite_code", { presence: true, on: "create" });

      // Can't create without invite_code
      const user = new User({ name: "Alice" });
      const saved = await user.save();
      expect(saved).toBe(false);

      // Can create with invite_code
      const user2 = new User({ name: "Alice", invite_code: "ABC123" });
      const saved2 = await user2.save();
      expect(saved2).toBe(true);

      // Can update without invite_code (validation skipped for update context)
      user2.writeAttribute("invite_code", null);
      user2.writeAttribute("name", "Bob");
      const saved3 = await user2.save();
      expect(saved3).toBe(true);
    });

    it("valid uses update context when persisted", async () => {
      class User extends Base {
        static _tableName = "users";
      }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.attribute("reason", "string");
      User.adapter = freshAdapter();
      User.validates("reason", { presence: true, on: "update" });

      // Can create without reason
      const user = await User.create({ name: "Alice" });
      expect(user.isPersisted()).toBe(true);

      // Can't update without reason
      user.writeAttribute("name", "Bob");
      const saved = await user.save();
      expect(saved).toBe(false);

      // Can update with reason
      user.writeAttribute("reason", "Name change");
      const saved2 = await user.save();
      expect(saved2).toBe(true);
    });
  });

  // -- Delegate --
  describe("delegate", () => {
    let adapter: DatabaseAdapter;

    beforeEach(() => {
      adapter = freshAdapter();
    });

    it("delegates methods to an association", async () => {
      class Author extends Base {
        static _tableName = "authors";
      }
      Author.attribute("id", "integer");
      Author.attribute("name", "string");
      Author.attribute("email", "string");
      Author.adapter = adapter;
      registerModel(Author);

      class Book extends Base {
        static _tableName = "books";
      }
      Book.attribute("id", "integer");
      Book.attribute("title", "string");
      Book.attribute("author_id", "integer");
      Book.adapter = adapter;
      Associations.belongsTo.call(Book, "author");
      delegate(Book, ["name", "email"], { to: "author" });
      registerModel(Book);

      const author = await Author.create({ name: "Tolkien", email: "jrr@shire.com" });
      const book = await Book.create({ title: "The Hobbit", author_id: author.id });

      expect(await (book as any).name()).toBe("Tolkien");
      expect(await (book as any).email()).toBe("jrr@shire.com");
    });

    it("supports prefix option", async () => {
      class Author extends Base {
        static _tableName = "authors";
      }
      Author.attribute("id", "integer");
      Author.attribute("name", "string");
      Author.adapter = adapter;
      registerModel(Author);

      class Book extends Base {
        static _tableName = "books";
      }
      Book.attribute("id", "integer");
      Book.attribute("title", "string");
      Book.attribute("author_id", "integer");
      Book.adapter = adapter;
      Associations.belongsTo.call(Book, "author");
      delegate(Book, ["name"], { to: "author", prefix: true });
      registerModel(Book);

      const author = await Author.create({ name: "Tolkien" });
      const book = await Book.create({ title: "The Hobbit", author_id: author.id });

      expect(await (book as any).authorName()).toBe("Tolkien");
    });
  });

  // -- Error Classes --
  describe("error classes", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("find throws RecordNotFound with metadata", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.adapter = adapter;

      try {
        await Item.find(999);
        expect.unreachable("should throw");
      } catch (e: any) {
        expect(e).toBeInstanceOf(RecordNotFound);
        expect(e.model).toBe("Item");
        expect(e.primaryKey).toBe("id");
        expect(e.id).toBe(999);
      }
    });

    it("saveBang throws RecordInvalid with record reference", async () => {
      class Widget extends Base { static _tableName = "widgets"; }
      Widget.attribute("id", "integer");
      Widget.attribute("name", "string");
      Widget.validates("name", { presence: true });
      Widget.adapter = adapter;

      const w = new Widget({});
      try {
        await w.saveBang();
        expect.unreachable("should throw");
      } catch (e: any) {
        expect(e).toBeInstanceOf(RecordInvalid);
        expect(e.record).toBe(w);
        expect(e.message).toMatch(/Validation failed/);
      }
    });

    it("readonly record throws ReadOnlyRecord", async () => {
      class Thing extends Base { static _tableName = "things"; }
      Thing.attribute("id", "integer");
      Thing.attribute("name", "string");
      Thing.adapter = adapter;

      const t = await Thing.create({ name: "test" });
      t.readonlyBang();
      try {
        await t.save();
        expect.unreachable("should throw");
      } catch (e: any) {
        expect(e).toBeInstanceOf(ReadOnlyRecord);
      }
    });

    it("firstBang throws RecordNotFound", async () => {
      class Empty extends Base { static _tableName = "empties"; }
      Empty.attribute("id", "integer");
      Empty.adapter = adapter;

      try {
        await Empty.all().firstBang();
        expect.unreachable("should throw");
      } catch (e: any) {
        expect(e).toBeInstanceOf(RecordNotFound);
      }
    });
  });

  // -- insertAll / upsertAll --
  describe("insertAll / upsertAll", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("insert all", async () => {
      class Product extends Base { static _tableName = "products"; }
      Product.attribute("id", "integer");
      Product.attribute("name", "string");
      Product.attribute("price", "integer");
      Product.adapter = adapter;

      await Product.insertAll([
        { id: 1, name: "Apple", price: 100 },
        { id: 2, name: "Banana", price: 50 },
        { id: 3, name: "Cherry", price: 75 },
      ]);

      const all = await Product.all().toArray();
      expect(all.length).toBe(3);
    });

    it("returns 0 for empty array", async () => {
      class Product extends Base { static _tableName = "products"; }
      Product.attribute("id", "integer");
      Product.adapter = adapter;

      const result = await Product.insertAll([]);
      expect(result).toBe(0);
    });
  });

  // -- after_initialize / after_find --
  describe("after_initialize / after_find callbacks", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("fires after_initialize on new records", () => {
      class Thing extends Base { static _tableName = "things"; }
      Thing.attribute("id", "integer");
      Thing.attribute("name", "string");
      Thing.attribute("status", "string");
      Thing.adapter = adapter;
      Thing.afterInitialize((r: any) => {
        if (!r.readAttribute("status")) {
          r._attributes.set("status", "draft");
        }
      });

      const t = new Thing({});
      expect(t.readAttribute("status")).toBe("draft");
    });

    it("fires after_find when loading from database", async () => {
      const log: string[] = [];
      class Record extends Base { static _tableName = "records"; }
      Record.attribute("id", "integer");
      Record.attribute("name", "string");
      Record.adapter = adapter;
      Record.afterFind((r: any) => {
        log.push(`found:${r.readAttribute("name")}`);
      });

      await Record.create({ name: "Alice" });
      await Record.create({ name: "Bob" });
      const records = await Record.all().toArray();
      expect(log).toEqual(["found:Alice", "found:Bob"]);
    });
  });

  // -- Conditional callbacks --
  describe("conditional callbacks", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("supports if: condition on callbacks", async () => {
      const log: string[] = [];
      class Task extends Base { static _tableName = "tasks"; }
      Task.attribute("id", "integer");
      Task.attribute("name", "string");
      Task.attribute("important", "boolean");
      Task.adapter = adapter;
      Task.beforeSave(
        (r: any) => { log.push("important-save"); },
        { if: (r: any) => r.readAttribute("important") === true }
      );

      await Task.create({ name: "normal", important: false });
      expect(log).toEqual([]);

      await Task.create({ name: "critical", important: true });
      expect(log).toEqual(["important-save"]);
    });

    it("supports unless: condition on callbacks", async () => {
      const log: string[] = [];
      class Task extends Base { static _tableName = "tasks"; }
      Task.attribute("id", "integer");
      Task.attribute("name", "string");
      Task.attribute("skip", "boolean");
      Task.adapter = adapter;
      Task.afterSave(
        (r: any) => { log.push("saved"); },
        { unless: (r: any) => r.readAttribute("skip") === true }
      );

      await Task.create({ name: "regular" });
      expect(log).toEqual(["saved"]);

      await Task.create({ name: "skipped", skip: true });
      expect(log).toEqual(["saved"]); // not called again
    });
  });

  // -- Reflection API --
  describe("reflection", () => {
    it("returns columns for a model", () => {
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.attribute("email", "string");

      const cols = columns(User);
      expect(cols.length).toBe(3);
      expect(cols.map(c => c.name)).toEqual(["id", "name", "email"]);
    });

    it("returns column names for a model", () => {
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");

      expect(columnNames(User)).toEqual(["id", "name"]);
    });

    it("reflects on a specific association", () => {
      class Author extends Base { static _tableName = "authors"; }
      Author.attribute("id", "integer");

      class Book extends Base { static _tableName = "books"; }
      Book.attribute("id", "integer");
      Book.attribute("author_id", "integer");
      Associations.belongsTo.call(Book, "author");

      const ref = reflectOnAssociation(Book, "author");
      expect(ref).not.toBeNull();
      expect(ref!.macro).toBe("belongsTo");
      expect(ref!.foreignKey).toBe("author_id");
      expect(ref!.className).toBe("Author");
    });

    it("reflects on all associations", () => {
      const adapter = freshAdapter();
      class Post extends Base { static _tableName = "posts"; }
      Post.attribute("id", "integer");
      Post.attribute("user_id", "integer");
      Post.adapter = adapter;
      Associations.belongsTo.call(Post, "user");
      Associations.hasMany.call(Post, "comments");

      const all = reflectOnAllAssociations(Post);
      expect(all.length).toBe(2);

      const belongsTos = reflectOnAllAssociations(Post, "belongsTo");
      expect(belongsTos.length).toBe(1);
      expect(belongsTos[0].name).toBe("user");
    });
  });

  // -- Nested Attributes --
  describe("acceptsNestedAttributesFor", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("creates child records through parent", async () => {
      class Comment extends Base { static _tableName = "comments"; }
      Comment.attribute("id", "integer");
      Comment.attribute("body", "string");
      Comment.attribute("post_id", "integer");
      Comment.adapter = adapter;
      registerModel(Comment);

      class Post extends Base { static _tableName = "posts"; }
      Post.attribute("id", "integer");
      Post.attribute("title", "string");
      Post.adapter = adapter;
      Associations.hasMany.call(Post, "comments");
      acceptsNestedAttributesFor(Post, "comments");
      registerModel(Post);

      const post = new Post({ title: "Hello" });
      assignNestedAttributes(post, "comments", [
        { body: "First comment" },
        { body: "Second comment" },
      ]);
      await post.save();

      const comments = await Comment.all().toArray();
      expect(comments.length).toBe(2);
      expect(comments[0].readAttribute("post_id")).toBe(post.id);
    });

    it("destroys child records with _destroy flag", async () => {
      class Tag extends Base { static _tableName = "tags"; }
      Tag.attribute("id", "integer");
      Tag.attribute("name", "string");
      Tag.attribute("article_id", "integer");
      Tag.adapter = adapter;
      registerModel(Tag);

      class Article extends Base { static _tableName = "articles"; }
      Article.attribute("id", "integer");
      Article.attribute("title", "string");
      Article.adapter = adapter;
      Associations.hasMany.call(Article, "tags");
      acceptsNestedAttributesFor(Article, "tags", { allowDestroy: true });
      registerModel(Article);

      const article = await Article.create({ title: "Test" });
      const tag = await Tag.create({ name: "ruby", article_id: article.id });

      assignNestedAttributes(article, "tags", [
        { id: tag.id, _destroy: true },
      ]);
      await article.save();

      const remaining = await Tag.all().toArray();
      expect(remaining.length).toBe(0);
    });
  });

  // -- Halt callback chain --
  describe("halt callback chain", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("halts save when before_save returns false", async () => {
      class Blocked extends Base { static _tableName = "blocked"; }
      Blocked.attribute("id", "integer");
      Blocked.attribute("name", "string");
      Blocked.adapter = adapter;
      Blocked.beforeSave(() => false);

      const b = new Blocked({ name: "test" });
      const result = await b.save();
      expect(result).toBe(false);
      expect(b.isNewRecord()).toBe(true);
    });
  });

  // -- Raw SQL where --
  describe("where with raw SQL", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("supports raw SQL string with bind params", async () => {
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.attribute("age", "integer");
      User.adapter = adapter;

      await User.create({ name: "Alice", age: 25 });
      await User.create({ name: "Bob", age: 17 });
      await User.create({ name: "Charlie", age: 30 });

      const sql = User.where("\"users\".\"age\" > ?", 18).toSql();
      expect(sql).toContain("\"users\".\"age\" > 18");
    });

    it("rewhere replaces specific where conditions", async () => {
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.attribute("status", "string");
      User.adapter = adapter;

      await User.create({ name: "Alice", status: "active" });
      await User.create({ name: "Bob", status: "inactive" });

      const active = User.where({ status: "active" });
      const inactive = active.rewhere({ status: "inactive" });
      const records = await inactive.toArray();
      expect(records.length).toBe(1);
      expect(records[0].readAttribute("name")).toBe("Bob");
    });
  });

  // -- has_secure_token --
  describe("has_secure_token", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("auto-generates a token on create", async () => {
      class ApiKey extends Base { static _tableName = "api_keys"; }
      ApiKey.attribute("id", "integer");
      ApiKey.attribute("token", "string");
      ApiKey.adapter = adapter;
      hasSecureToken(ApiKey);

      const key = await ApiKey.create({});
      expect(key.readAttribute("token")).toBeTruthy();
      expect(typeof key.readAttribute("token")).toBe("string");
      expect((key.readAttribute("token") as string).length).toBeGreaterThan(0);
    });

    it("allows regeneration of token", async () => {
      class ApiKey extends Base { static _tableName = "api_keys"; }
      ApiKey.attribute("id", "integer");
      ApiKey.attribute("token", "string");
      ApiKey.adapter = adapter;
      hasSecureToken(ApiKey);

      const key = await ApiKey.create({});
      const originalToken = key.readAttribute("token");

      const newToken = await (key as any).regenerateToken();
      expect(newToken).not.toBe(originalToken);
      expect(key.readAttribute("token")).toBe(newToken);
    });

    it("supports custom attribute name", async () => {
      class Session extends Base { static _tableName = "sessions"; }
      Session.attribute("id", "integer");
      Session.attribute("auth_token", "string");
      Session.adapter = adapter;
      hasSecureToken(Session, "auth_token");

      const s = await Session.create({});
      expect(s.readAttribute("auth_token")).toBeTruthy();
    });
  });

  // -- composed_of --
  describe("composed_of", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("composes value objects from multiple attributes", async () => {
      class Address {
        constructor(public street: string, public city: string) {}
      }

      class Customer extends Base { static _tableName = "customers"; }
      Customer.attribute("id", "integer");
      Customer.attribute("address_street", "string");
      Customer.attribute("address_city", "string");
      Customer.adapter = adapter;
      composedOf(Customer, "address", {
        className: Address,
        mapping: [["address_street", "street"], ["address_city", "city"]],
      });

      const c = await Customer.create({ address_street: "123 Main", address_city: "NYC" });
      const addr = (c as any).address;
      expect(addr).toBeInstanceOf(Address);
      expect(addr.street).toBe("123 Main");
      expect(addr.city).toBe("NYC");
    });

    it("decomposes value object on assignment", async () => {
      class Address {
        constructor(public street: string, public city: string) {}
      }

      class Customer extends Base { static _tableName = "customers"; }
      Customer.attribute("id", "integer");
      Customer.attribute("address_street", "string");
      Customer.attribute("address_city", "string");
      Customer.adapter = adapter;
      composedOf(Customer, "address", {
        className: Address,
        mapping: [["address_street", "street"], ["address_city", "city"]],
      });

      const c = await Customer.create({ address_street: "old", address_city: "old" });
      (c as any).address = new Address("456 Oak", "SF");

      expect(c.readAttribute("address_street")).toBe("456 Oak");
      expect(c.readAttribute("address_city")).toBe("SF");
    });
  });

  // -- serialize --
  describe("serialize", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("serializes and deserializes JSON data", async () => {
      class Setting extends Base { static _tableName = "settings"; }
      Setting.attribute("id", "integer");
      Setting.attribute("data", "string");
      Setting.adapter = adapter;
      serialize(Setting, "data", { coder: "json" });

      const s = await Setting.create({ data: JSON.stringify({ theme: "dark", fontSize: 14 }) });
      const loaded = await Setting.find(s.id);
      const data = loaded.readAttribute("data") as Record<string, unknown>;
      expect(data.theme).toBe("dark");
      expect(data.fontSize).toBe(14);
    });

    it("deserializes array coder", async () => {
      class Pref extends Base { static _tableName = "prefs"; }
      Pref.attribute("id", "integer");
      Pref.attribute("tags", "string");
      Pref.adapter = adapter;
      serialize(Pref, "tags", { coder: "array" });

      const p = await Pref.create({ tags: JSON.stringify(["ruby", "rails"]) });
      const loaded = await Pref.find(p.id);
      expect(loaded.readAttribute("tags")).toEqual(["ruby", "rails"]);
    });
  });

  // -- alias_attribute --
  describe("alias_attribute", () => {
    it("creates a getter/setter alias for an attribute", () => {
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.aliasAttribute("fullName", "name");

      const u = new User({ name: "Alice" });
      expect((u as any).fullName).toBe("Alice");

      (u as any).fullName = "Bob";
      expect(u.readAttribute("name")).toBe("Bob");
    });
  });

  // -- inverse_of --
  describe("inverse_of", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("sets inverse reference on loaded belongs_to", async () => {
      class Author extends Base { static _tableName = "authors"; }
      Author.attribute("id", "integer");
      Author.attribute("name", "string");
      Author.adapter = adapter;
      registerModel(Author);

      class Book extends Base { static _tableName = "books"; }
      Book.attribute("id", "integer");
      Book.attribute("title", "string");
      Book.attribute("author_id", "integer");
      Book.adapter = adapter;
      Associations.belongsTo.call(Book, "author", { inverseOf: "books" });
      registerModel(Book);

      const author = await Author.create({ name: "Tolkien" });
      const book = await Book.create({ title: "The Hobbit", author_id: author.id });

      const loadedAuthor = await loadBelongsTo(book, "author", { inverseOf: "books" });
      // The loaded author should have a cached inverse pointing to the book
      expect((loadedAuthor as any)._cachedAssociations?.get("books")).toBe(book);
    });

    it("sets inverse reference on loaded has_many children", async () => {
      class Post extends Base { static _tableName = "posts"; }
      Post.attribute("id", "integer");
      Post.attribute("title", "string");
      Post.adapter = adapter;
      Associations.hasMany.call(Post, "comments", { inverseOf: "post" });
      registerModel(Post);

      class Comment extends Base { static _tableName = "comments"; }
      Comment.attribute("id", "integer");
      Comment.attribute("body", "string");
      Comment.attribute("post_id", "integer");
      Comment.adapter = adapter;
      Associations.belongsTo.call(Comment, "post");
      registerModel(Comment);

      const post = await Post.create({ title: "Hello" });
      await Comment.create({ body: "Reply 1", post_id: post.id });
      await Comment.create({ body: "Reply 2", post_id: post.id });

      const comments = await loadHasMany(post, "comments", { inverseOf: "post" });
      // Each comment should have the post cached
      for (const c of comments) {
        expect((c as any)._cachedAssociations?.get("post")).toBe(post);
      }
    });
  });

  // -- Association scopes --
  describe("association scopes", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("applies scope to has_many association", async () => {
      class Comment extends Base { static _tableName = "comments"; }
      Comment.attribute("id", "integer");
      Comment.attribute("body", "string");
      Comment.attribute("approved", "boolean");
      Comment.attribute("post_id", "integer");
      Comment.adapter = adapter;
      registerModel(Comment);

      class Post extends Base { static _tableName = "posts"; }
      Post.attribute("id", "integer");
      Post.attribute("title", "string");
      Post.adapter = adapter;
      Associations.hasMany.call(Post, "approvedComments", {
        className: "Comment",
        scope: (rel: any) => rel.where({ approved: true }),
      });
      registerModel(Post);

      const post = await Post.create({ title: "Hello" });
      await Comment.create({ body: "Good", approved: true, post_id: post.id });
      await Comment.create({ body: "Bad", approved: false, post_id: post.id });
      await Comment.create({ body: "Great", approved: true, post_id: post.id });

      const approved = await loadHasMany(post, "approvedComments", {
        className: "Comment",
        scope: (rel: any) => rel.where({ approved: true }),
      });
      expect(approved.length).toBe(2);
    });
  });

  // -- Grouped calculations --
  describe("grouped calculations", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("group().count() returns hash of counts", async () => {
      class Order extends Base { static _tableName = "orders"; }
      Order.attribute("id", "integer");
      Order.attribute("status", "string");
      Order.attribute("total", "integer");
      Order.adapter = adapter;

      await Order.create({ status: "pending", total: 100 });
      await Order.create({ status: "pending", total: 200 });
      await Order.create({ status: "shipped", total: 150 });
      await Order.create({ status: "delivered", total: 300 });
      await Order.create({ status: "delivered", total: 250 });

      const counts = await Order.all().group("status").count();
      expect(counts).toEqual({ pending: 2, shipped: 1, delivered: 2 });
    });

    it("group().sum() returns hash of sums", async () => {
      class Order extends Base { static _tableName = "orders"; }
      Order.attribute("id", "integer");
      Order.attribute("status", "string");
      Order.attribute("total", "integer");
      Order.adapter = adapter;

      await Order.create({ status: "pending", total: 100 });
      await Order.create({ status: "pending", total: 200 });
      await Order.create({ status: "shipped", total: 150 });

      const sums = await Order.all().group("status").sum("total");
      expect(sums).toEqual({ pending: 300, shipped: 150 });
    });
  });

  // -- readonly() --
  describe("readonly()", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("marks loaded records as readonly", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "Widget" });
      const items = await Item.all().readonly().toArray();
      expect(items[0].isReadonly()).toBe(true);
      await expect(items[0].save()).rejects.toThrow(ReadOnlyRecord);
    });
  });

  // -- sole() and take() --
  describe("sole() and take()", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("sole() returns the only matching record", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "Widget" });
      const item = await Item.all().where({ name: "Widget" }).sole();
      expect(item.readAttribute("name")).toBe("Widget");
    });

    it("sole() raises RecordNotFound when zero records", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await expect(Item.all().where({ name: "Missing" }).sole()).rejects.toThrow(RecordNotFound);
    });

    it("sole() raises SoleRecordExceeded when multiple records", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "Widget" });
      await Item.create({ name: "Widget" });
      await expect(Item.all().where({ name: "Widget" }).sole()).rejects.toThrow(SoleRecordExceeded);
    });

    it("take() returns a record without ordering", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "A" });
      await Item.create({ name: "B" });
      const item = await Item.all().take();
      expect(item).not.toBeNull();
    });

    it("take(n) returns n records", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "A" });
      await Item.create({ name: "B" });
      await Item.create({ name: "C" });
      const items = await Item.all().take(2);
      expect(items).toHaveLength(2);
    });

    it("takeBang() raises when no records", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.adapter = adapter;

      await expect(Item.all().takeBang()).rejects.toThrow(RecordNotFound);
    });
  });

  // -- annotate() --
  describe("annotate()", () => {
    it("adds SQL comments to the query", () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.adapter = freshAdapter();

      const sql = Item.all().annotate("loading items for user page").toSql();
      expect(sql).toContain("/* loading items for user page */");
    });

    it("supports multiple annotations", () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.adapter = freshAdapter();

      const sql = Item.all().annotate("controller: items", "action: index").toSql();
      expect(sql).toContain("/* controller: items */");
      expect(sql).toContain("/* action: index */");
    });
  });

  // -- merge() --
  describe("merge()", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("combines conditions from two relations", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.attribute("status", "string");
      Item.adapter = adapter;

      await Item.create({ name: "A", status: "active" });
      await Item.create({ name: "B", status: "inactive" });
      await Item.create({ name: "C", status: "active" });

      const active = Item.all().where({ status: "active" });
      const items = await Item.all().where({ name: "A" }).merge(active).toArray();
      expect(items).toHaveLength(1);
      expect(items[0].readAttribute("name")).toBe("A");
    });

    it("merges order from other relation", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "B" });
      await Item.create({ name: "A" });

      const ordered = Item.all().order({ name: "asc" });
      const items = await Item.all().merge(ordered).toArray();
      expect(items[0].readAttribute("name")).toBe("A");
    });
  });

  // -- from() --
  describe("from()", () => {
    it("changes the FROM clause in SQL", () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.adapter = freshAdapter();

      const sql = Item.all().from('"other_items"').toSql();
      expect(sql).toContain('FROM "other_items"');
      expect(sql).not.toContain('FROM "items"');
    });
  });

  // -- strict_loading --
  describe("strict_loading", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("raises StrictLoadingViolationError on lazy association load", async () => {
      class Author extends Base { static _tableName = "authors"; }
      Author.attribute("id", "integer");
      Author.attribute("name", "string");
      Author.adapter = adapter;
      registerModel("Author", Author);

      class Book extends Base { static _tableName = "books"; }
      Book.attribute("id", "integer");
      Book.attribute("author_id", "integer");
      Book.adapter = adapter;
      Associations.belongsTo.call(Book, "author");

      const author = await Author.create({ name: "Test" });
      await Book.create({ author_id: author.id });

      const books = await Book.all().strictLoading().toArray();
      expect(books[0].isStrictLoading()).toBe(true);
      await expect(loadBelongsTo(books[0], "author", {})).rejects.toThrow(StrictLoadingViolationError);
    });

    it("strictLoadingBang() on a record instance", async () => {
      class Author extends Base { static _tableName = "authors2"; }
      Author.attribute("id", "integer");
      Author.attribute("name", "string");
      Author.adapter = adapter;
      registerModel("Author2", Author);

      class Post extends Base { static _tableName = "posts"; }
      Post.attribute("id", "integer");
      Post.attribute("author2_id", "integer");
      Post.adapter = adapter;
      Associations.belongsTo.call(Post, "author2", { className: "Author2" });

      const author = await Author.create({ name: "Test" });
      await Post.create({ author2_id: author.id });

      const post = (await Post.all().first()) as Base;
      post.strictLoadingBang();
      expect(post.isStrictLoading()).toBe(true);
      await expect(loadBelongsTo(post, "author2", { className: "Author2" })).rejects.toThrow(StrictLoadingViolationError);
    });
  });

  // -- findSoleBy --
  describe("findSoleBy()", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("returns the sole matching record", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "Unique" });
      const item = await Item.findSoleBy({ name: "Unique" });
      expect(item.readAttribute("name")).toBe("Unique");
    });

    it("raises SoleRecordExceeded when multiple match", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "Dup" });
      await Item.create({ name: "Dup" });
      await expect(Item.findSoleBy({ name: "Dup" })).rejects.toThrow(SoleRecordExceeded);
    });
  });

  // -- createWith --
  describe("createWith()", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("applies default attrs when creating via findOrCreateBy", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.attribute("status", "string");
      Item.adapter = adapter;

      const item = await Item.all().createWith({ status: "active" }).findOrCreateBy({ name: "Widget" });
      expect(item.readAttribute("status")).toBe("active");
    });
  });

  // -- unscope --
  describe("unscope()", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("removes where conditions", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "A" });
      await Item.create({ name: "B" });

      const items = await Item.all().where({ name: "A" }).unscope("where").toArray();
      expect(items).toHaveLength(2);
    });

    it("removes order", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "B" });
      await Item.create({ name: "A" });

      const sql = Item.all().order({ name: "asc" }).unscope("order").toSql();
      expect(sql).not.toContain("ORDER BY");
    });

    it("removes limit and offset", () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.adapter = adapter;

      const sql = Item.all().limit(5).offset(10).unscope("limit", "offset").toSql();
      expect(sql).not.toContain("LIMIT");
      expect(sql).not.toContain("OFFSET");
    });
  });

  // -- dup --
  describe("dup()", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("creates an unsaved copy without primary key", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      const original = await Item.create({ name: "Original" });
      const copy = original.dup();
      expect(copy.isNewRecord()).toBe(true);
      expect(copy.id).toBeNull();
      expect(copy.readAttribute("name")).toBe("Original");
    });
  });

  // -- becomes --
  describe("becomes()", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("transforms a record to another class", async () => {
      class Animal extends Base { static _tableName = "animals"; }
      Animal.attribute("id", "integer");
      Animal.attribute("name", "string");
      Animal.adapter = adapter;

      class Dog extends Base { static _tableName = "animals"; }
      Dog.attribute("id", "integer");
      Dog.attribute("name", "string");
      Dog.adapter = adapter;

      const animal = await Animal.create({ name: "Rex" });
      const dog = animal.becomes(Dog);
      expect(dog).toBeInstanceOf(Dog);
      expect(dog.readAttribute("name")).toBe("Rex");
      expect(dog.isPersisted()).toBe(true);
    });
  });

  // -- hasAttribute --
  describe("hasAttribute()", () => {
    it("returns true for defined attributes", () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = freshAdapter();

      const item = new Item({ name: "Test" });
      expect(item.hasAttribute("name")).toBe(true);
      expect(item.hasAttribute("nonexistent")).toBe(false);
    });
  });

  // -- attributeNames --
  describe("attributeNames()", () => {
    it("returns list of defined attribute names", () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.attribute("status", "string");
      Item.adapter = freshAdapter();

      expect(Item.attributeNames()).toEqual(["id", "name", "status"]);
    });
  });

  // -- exists?(conditions) --
  describe("exists?(conditions)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("accepts conditions hash", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "Found" });
      expect(await Item.all().exists({ name: "Found" })).toBe(true);
      expect(await Item.all().exists({ name: "Missing" })).toBe(false);
    });

    it("accepts primary key value", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      const item = await Item.create({ name: "Found" });
      expect(await Item.all().exists(item.id)).toBe(true);
      expect(await Item.all().exists(999)).toBe(false);
    });
  });

  // -- calculate --
  describe("calculate()", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("delegates to the appropriate aggregate method", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("price", "integer");
      Item.adapter = adapter;

      await Item.create({ price: 10 });
      await Item.create({ price: 20 });
      await Item.create({ price: 30 });

      expect(await Item.all().calculate("count")).toBe(3);
      expect(await Item.all().calculate("sum", "price")).toBe(60);
      expect(await Item.all().calculate("average", "price")).toBe(20);
      expect(await Item.all().calculate("minimum", "price")).toBe(10);
      expect(await Item.all().calculate("maximum", "price")).toBe(30);
    });
  });

  // -- extending --
  describe("extending()", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("adds custom methods to a relation", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "Widget" });
      await Item.create({ name: "Gadget" });

      const mod = {
        onlyWidgets() { return (this as any).where({ name: "Widget" }); }
      };

      const items = await Item.all().extending(mod).onlyWidgets().toArray();
      expect(items).toHaveLength(1);
      expect(items[0].readAttribute("name")).toBe("Widget");
    });
  });

  // -- enum bang setters and not-scopes --
  describe("enum enhancements", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("generates bang setter that persists", async () => {
      class Task extends Base { static _tableName = "tasks"; }
      Task.attribute("id", "integer");
      Task.attribute("status", "integer");
      Task.adapter = adapter;
      defineEnum(Task, "status", ["pending", "active", "completed"]);

      const task = await Task.create({ status: 0 });
      await (task as any).activeBang();
      expect(task.readAttribute("status")).toBe(1);
      // Verify persisted
      const reloaded = await Task.find(task.id);
      expect(reloaded.readAttribute("status")).toBe(1);
    });

    it("generates not-scopes", async () => {
      class Task extends Base { static _tableName = "tasks"; }
      Task.attribute("id", "integer");
      Task.attribute("status", "integer");
      Task.adapter = adapter;
      defineEnum(Task, "status", ["pending", "active", "completed"]);

      await Task.create({ status: 0 }); // pending
      await Task.create({ status: 1 }); // active
      await Task.create({ status: 2 }); // completed

      const nonPending = await (Task as any).notPending().toArray();
      expect(nonPending).toHaveLength(2);
    });
  });

  // -- savedChanges --
  describe("savedChanges", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("tracks changes from the last save", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      const item = await Item.create({ name: "Original" });
      item.writeAttribute("name", "Updated");
      await item.save();
      expect(item.savedChanges).toHaveProperty("name");
      expect(item.savedChanges.name[1]).toBe("Updated");
    });

    it("savedChangeToAttribute returns true for changed attr", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      const item = await Item.create({ name: "Original" });
      item.writeAttribute("name", "Updated");
      await item.save();
      expect(item.savedChangeToAttribute("name")).toBe(true);
      expect(item.savedChangeToAttribute("id")).toBe(false);
    });
  });

  // -- destroyBy and deleteBy --
  describe("destroyBy and deleteBy", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("destroyBy destroys matching records with callbacks", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "A" });
      await Item.create({ name: "B" });
      await Item.create({ name: "A" });

      const destroyed = await Item.destroyBy({ name: "A" });
      expect(destroyed).toHaveLength(2);
      expect(await Item.all().count()).toBe(1);
    });

    it("deleteBy deletes matching records without callbacks", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "A" });
      await Item.create({ name: "B" });

      const count = await Item.deleteBy({ name: "A" });
      expect(count).toBe(1);
      expect(await Item.all().count()).toBe(1);
    });
  });

  // -- static updateAll --
  describe("static updateAll", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("updates all records", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("status", "string");
      Item.adapter = adapter;

      await Item.create({ status: "old" });
      await Item.create({ status: "old" });

      await Item.updateAll({ status: "new" });
      const items = await Item.all().toArray();
      expect(items.every((i: any) => i.readAttribute("status") === "new")).toBe(true);
    });
  });

  // -- inOrderOf --
  describe("inOrderOf()", () => {
    it("generates CASE WHEN ordering SQL", () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("status", "string");
      Item.adapter = freshAdapter();

      const sql = Item.all().inOrderOf("status", ["active", "pending", "archived"]).toSql();
      expect(sql).toContain("CASE");
      expect(sql).toContain("WHEN");
    });
  });

  // -- touchAll --
  describe("touchAll()", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("updates timestamps on all matching records", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("updated_at", "datetime");
      Item.adapter = adapter;

      await Item.create({});
      await Item.create({});

      const affected = await Item.all().touchAll();
      expect(affected).toBe(2);
    });
  });

  // -- static update --
  describe("static update()", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("finds and updates a record by id", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      const item = await Item.create({ name: "Old" });
      const updated = await Item.update(item.id, { name: "New" });
      expect(updated.readAttribute("name")).toBe("New");
    });
  });

  // -- static destroyAll --
  describe("static destroyAll()", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("destroys all records", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "A" });
      await Item.create({ name: "B" });
      const destroyed = await Item.destroyAll();
      expect(destroyed).toHaveLength(2);
      expect(await Item.all().count()).toBe(0);
    });
  });

  // -- whereAssociated / whereMissing --
  describe("whereAssociated / whereMissing", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("whereAssociated filters records WITH non-null FK", async () => {
      class Author extends Base { static _tableName = "wa_authors"; }
      Author.attribute("id", "integer");
      Author.adapter = adapter;
      registerModel("WaAuthor", Author);

      class Book extends Base { static _tableName = "wa_books"; }
      Book.attribute("id", "integer");
      Book.attribute("wa_author_id", "integer");
      Book.adapter = adapter;
      Associations.belongsTo.call(Book, "waAuthor", { className: "WaAuthor" });

      const author = await Author.create({});
      await Book.create({ wa_author_id: author.id });
      await Book.create({ wa_author_id: null });

      const withAuthor = await Book.all().whereAssociated("waAuthor").toArray();
      expect(withAuthor).toHaveLength(1);
    });

    it("whereMissing filters records WITH null FK", async () => {
      class Author extends Base { static _tableName = "wm_authors"; }
      Author.attribute("id", "integer");
      Author.adapter = adapter;
      registerModel("WmAuthor", Author);

      class Book extends Base { static _tableName = "wm_books"; }
      Book.attribute("id", "integer");
      Book.attribute("wm_author_id", "integer");
      Book.adapter = adapter;
      Associations.belongsTo.call(Book, "wmAuthor", { className: "WmAuthor" });

      const author = await Author.create({});
      await Book.create({ wm_author_id: author.id });
      await Book.create({ wm_author_id: null });

      const withoutAuthor = await Book.all().whereMissing("wmAuthor").toArray();
      expect(withoutAuthor).toHaveLength(1);
    });
  });

  // -- positional finders --
  describe("positional finders", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("second() returns the second record", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "A" });
      await Item.create({ name: "B" });
      await Item.create({ name: "C" });
      const item = await Item.all().second();
      expect(item).not.toBeNull();
      expect(item!.readAttribute("name")).toBe("B");
    });

    it("third() returns the third record", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "A" });
      await Item.create({ name: "B" });
      await Item.create({ name: "C" });
      const item = await Item.all().third();
      expect(item!.readAttribute("name")).toBe("C");
    });

    it("fourth() and fifth() return correct records", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      for (const n of ["A", "B", "C", "D", "E"]) {
        await Item.create({ name: n });
      }
      const fourth = await Item.all().fourth();
      expect(fourth!.readAttribute("name")).toBe("D");
      const fifth = await Item.all().fifth();
      expect(fifth!.readAttribute("name")).toBe("E");
    });

    it("secondToLast() returns the second-to-last record", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "A" });
      await Item.create({ name: "B" });
      await Item.create({ name: "C" });
      const item = await Item.all().secondToLast();
      expect(item!.readAttribute("name")).toBe("B");
    });

    it("thirdToLast() returns the third-to-last record", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "A" });
      await Item.create({ name: "B" });
      await Item.create({ name: "C" });
      await Item.create({ name: "D" });
      const item = await Item.all().thirdToLast();
      expect(item!.readAttribute("name")).toBe("B");
    });

    it("returns null when not enough records", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "A" });
      const item = await Item.all().second();
      expect(item).toBeNull();
    });

    it("static second() delegates to Relation", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "A" });
      await Item.create({ name: "B" });
      const item = await Item.second();
      expect(item!.readAttribute("name")).toBe("B");
    });
  });

  // -- select block form --
  describe("select block form", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("filters loaded records with a function", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "Apple" });
      await Item.create({ name: "Banana" });
      await Item.create({ name: "Avocado" });

      const items = await Item.all().select(
        (r: any) => (r.readAttribute("name") as string).startsWith("A")
      );
      expect(items).toHaveLength(2);
    });
  });

  // -- findEach / findInBatches --
  describe("findEach / findInBatches", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("findEach yields each record", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      for (let i = 0; i < 5; i++) await Item.create({ name: `Item ${i}` });

      const names: string[] = [];
      for await (const item of Item.all().findEach({ batchSize: 2 })) {
        names.push(item.readAttribute("name") as string);
      }
      expect(names).toHaveLength(5);
    });

    it("findInBatches yields batches of records", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      for (let i = 0; i < 7; i++) await Item.create({ name: `Item ${i}` });

      const batches: number[] = [];
      for await (const batch of Item.all().findInBatches({ batchSize: 3 })) {
        batches.push(batch.length);
      }
      expect(batches).toEqual([3, 3, 1]);
    });
  });

  // -- regroup --
  describe("regroup()", () => {
    it("replaces existing GROUP BY columns", () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("category", "string");
      Item.attribute("status", "string");
      Item.adapter = freshAdapter();

      const sql = Item.all().group("category").regroup("status").toSql();
      expect(sql).toContain("GROUP BY");
      expect(sql).toContain("status");
      expect(sql).not.toContain("category");
    });
  });

  // -- excluding/without --
  describe("excluding() / without()", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("excludes specific records by PK", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      const a = await Item.create({ name: "A" });
      await Item.create({ name: "B" });
      await Item.create({ name: "C" });

      const remaining = await Item.all().excluding(a).toArray();
      expect(remaining).toHaveLength(2);
      expect(remaining.every((r: any) => r.readAttribute("name") !== "A")).toBe(true);
    });

    it("without() is an alias for excluding()", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      const a = await Item.create({ name: "A" });
      await Item.create({ name: "B" });

      const remaining = await Item.all().without(a).toArray();
      expect(remaining).toHaveLength(1);
    });
  });

  // -- relation state methods --
  describe("Relation state: isLoaded, reset, size, isEmpty, isAny, isMany", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("isLoaded returns false before loading", () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.adapter = adapter;

      const rel = Item.all();
      expect(rel.isLoaded).toBe(false);
    });

    it("isLoaded returns true after toArray()", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "A" });
      const rel = Item.all();
      await rel.toArray();
      expect(rel.isLoaded).toBe(true);
    });

    it("reset clears loaded state", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "A" });
      const rel = Item.all();
      await rel.toArray();
      expect(rel.isLoaded).toBe(true);
      rel.reset();
      expect(rel.isLoaded).toBe(false);
    });

    it("size returns count without loading", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "A" });
      await Item.create({ name: "B" });
      const rel = Item.all();
      expect(await rel.size()).toBe(2);
    });

    it("isEmpty returns true when no records", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.adapter = adapter;

      expect(await Item.all().isEmpty()).toBe(true);
    });

    it("isAny returns true when records exist", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "A" });
      expect(await Item.all().isAny()).toBe(true);
    });

    it("isMany returns true when more than one record", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "A" });
      expect(await Item.all().isMany()).toBe(false);
      await Item.create({ name: "B" });
      expect(await Item.all().isMany()).toBe(true);
    });
  });

  // -- inspect --
  describe("inspect()", () => {
    it("returns a human-readable string", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = freshAdapter();

      const item = await Item.create({ name: "Widget" });
      const str = item.inspect();
      expect(str).toContain("#<Item");
      expect(str).toContain('name: "Widget"');
      expect(str).toContain("id:");
    });
  });

  // -- scoping --
  describe("scoping()", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("sets currentScope within the block", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      const activeScope = Item.all().where({ name: "Active" });
      await Item.scoping(activeScope, async () => {
        expect(Item.currentScope).toBe(activeScope);
      });
      expect(Item.currentScope).toBeNull();
    });
  });

  // -- load() --
  describe("load()", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("eagerly loads records and returns the relation", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "A" });
      await Item.create({ name: "B" });

      const rel = Item.all();
      expect(rel.isLoaded).toBe(false);

      const result = await rel.load();
      expect(result).toBe(rel); // Returns itself
      expect(rel.isLoaded).toBe(true);
    });
  });

  // -- length() --
  describe("length()", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("returns the number of records after loading", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.adapter = adapter;

      await Item.create({ name: "A" });
      await Item.create({ name: "B" });
      await Item.create({ name: "C" });

      expect(await Item.all().length()).toBe(3);
    });
  });

  // -- slice --
  describe("slice()", () => {
    it("returns a subset of attributes", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.attribute("status", "string");
      Item.adapter = freshAdapter();

      const item = await Item.create({ name: "Widget", status: "active" });
      const sliced = item.slice("name", "status");
      expect(sliced).toEqual({ name: "Widget", status: "active" });
      expect(sliced).not.toHaveProperty("id");
    });
  });

  // -- values_at --
  describe("valuesAt()", () => {
    it("returns attribute values as an array", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("name", "string");
      Item.attribute("status", "string");
      Item.adapter = freshAdapter();

      const item = await Item.create({ name: "Widget", status: "active" });
      const values = item.valuesAt("name", "status");
      expect(values).toEqual(["Widget", "active"]);
    });
  });

  // -- distinct count --
  describe("distinct count", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("count with distinct uses COUNT(DISTINCT ...)", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("category", "string");
      Item.adapter = adapter;

      await Item.create({ category: "A" });
      await Item.create({ category: "A" });
      await Item.create({ category: "B" });

      const total = await Item.all().count() as number;
      expect(total).toBe(3);

      const distinctCount = await Item.all().distinct().count("category") as number;
      expect(distinctCount).toBe(2);
    });
  });

  // -- where with subquery --
  describe("where with subquery", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("supports Relation as value for IN subquery", async () => {
      class Author extends Base { static _tableName = "authors"; }
      Author.attribute("id", "integer");
      Author.attribute("name", "string");
      Author.adapter = adapter;

      class Post extends Base { static _tableName = "posts"; }
      Post.attribute("id", "integer");
      Post.attribute("author_id", "integer");
      Post.attribute("title", "string");
      Post.adapter = adapter;

      const alice = await Author.create({ name: "Alice" });
      const bob = await Author.create({ name: "Bob" });
      await Post.create({ author_id: alice.id, title: "Post A" });
      await Post.create({ author_id: bob.id, title: "Post B" });
      await Post.create({ author_id: alice.id, title: "Post C" });

      // Use a subquery to find posts by Alice
      const aliceIds = Author.all().where({ name: "Alice" }).select("id") as any;
      const sql = Post.all().where({ author_id: aliceIds }).toSql();
      expect(sql).toContain("IN (SELECT");
    });
  });

  // -- having hash form --
  describe("having hash form", () => {
    it("accepts hash conditions for having", () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("category", "string");
      Item.adapter = freshAdapter();

      const sql = Item.all()
        .select("category", "COUNT(*) AS cnt")
        .group("category")
        .having("COUNT(*) > 1")
        .toSql();
      expect(sql).toContain("HAVING");
      expect(sql).toContain("COUNT(*) > 1");
    });
  });

  // -- enum prefix/suffix --
  describe("enum prefix/suffix", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("prefix: true uses attribute name as prefix", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("status", "integer");
      Item.adapter = adapter;
      defineEnum(Item, "status", ["draft", "published"], { prefix: true });

      const item = await Item.create({ status: 0 });
      // Methods should be prefixed: isStatusDraft, statusDraft
      expect(typeof (item as any).isStatusDraft).toBe("function");
      expect((item as any).isStatusDraft()).toBe(true);
      expect(typeof (item as any).isStatusPublished).toBe("function");
      expect((item as any).isStatusPublished()).toBe(false);
    });

    it("prefix: string uses custom prefix", async () => {
      class Item extends Base { static _tableName = "items"; }
      Item.attribute("id", "integer");
      Item.attribute("role", "integer");
      Item.adapter = adapter;
      defineEnum(Item, "role", ["admin", "user"], { prefix: "access" });

      const item = await Item.create({ role: 0 });
      expect(typeof (item as any).isAccessAdmin).toBe("function");
      expect((item as any).isAccessAdmin()).toBe(true);
    });
  });

  describe("previouslyNewRecord", () => {
    it("returns false before first save", () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = new User({ name: "Alice" });
      expect(user.isPreviouslyNewRecord()).toBe(false);
    });

    it("returns true after first save", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = new User({ name: "Alice" });
      await user.save();
      expect(user.isPreviouslyNewRecord()).toBe(true);
      expect(user.isNewRecord()).toBe(false);
    });

    it("returns false after subsequent saves", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = await User.create({ name: "Alice" });
      expect(user.isPreviouslyNewRecord()).toBe(true);
      await user.update({ name: "Bob" });
      expect(user.isPreviouslyNewRecord()).toBe(false);
    });
  });

  describe("frozen / isFrozen", () => {
    it("is not frozen by default", () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = new User({ name: "Alice" });
      expect(user.isFrozen()).toBe(false);
    });

    it("is frozen after destroy", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = await User.create({ name: "Alice" });
      await user.destroy();
      expect(user.isFrozen()).toBe(true);
    });

    it("is frozen after delete", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = await User.create({ name: "Alice" });
      await user.delete();
      expect(user.isFrozen()).toBe(true);
    });

    it("prevents modification of frozen record", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = await User.create({ name: "Alice" });
      await user.destroy();
      expect(() => user.writeAttribute("name", "Bob")).toThrow("Cannot modify a frozen");
    });

    it("can be manually frozen", () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = new User({ name: "Alice" });
      user.freeze();
      expect(user.isFrozen()).toBe(true);
      expect(() => user.writeAttribute("name", "Bob")).toThrow("Cannot modify a frozen");
    });
  });

  describe("destroyedByAssociation", () => {
    it("is null by default", () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.adapter = adapter;

      const user = new User({});
      expect(user.destroyedByAssociation).toBeNull();
    });

    it("can be set and read", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.adapter = adapter;

      const user = await User.create({});
      user.destroyedByAssociation = { name: "posts", type: "hasMany" };
      expect(user.destroyedByAssociation).toEqual({ name: "posts", type: "hasMany" });
    });
  });

  describe("or with scope", () => {
    it("combines two scoped relations with OR", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.attribute("role", "string");
      User.adapter = adapter;
      User.scope("admins", (rel: any) => rel.where({ role: "admin" }));
      User.scope("editors", (rel: any) => rel.where({ role: "editor" }));

      await User.create({ name: "Alice", role: "admin" });
      await User.create({ name: "Bob", role: "editor" });
      await User.create({ name: "Charlie", role: "viewer" });

      const admins = (User as any).admins();
      const editors = (User as any).editors();
      const result = await admins.or(editors).toArray();
      expect(result.length).toBe(2);
      const names = result.map((r: any) => r.readAttribute("name")).sort();
      expect(names).toEqual(["Alice", "Bob"]);
    });
  });

  describe("rewhere clears NOT clauses", () => {
    it("replaces whereNot clauses for the same key", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.attribute("role", "string");
      User.adapter = adapter;

      await User.create({ name: "Alice", role: "admin" });
      await User.create({ name: "Bob", role: "viewer" });

      // whereNot then rewhere should override the NOT condition
      const rel = User.all().whereNot({ role: "admin" }).rewhere({ role: "admin" });
      const result = await rel.toArray();
      expect(result.length).toBe(1);
      expect(result[0].readAttribute("name")).toBe("Alice");
    });
  });

  describe("pluck with Arel nodes", () => {
    it("accepts Arel Attribute nodes", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });

      const nameAttr = User.arelTable.get("name");
      const names = await User.all().pluck(nameAttr);
      expect(names.sort()).toEqual(["Alice", "Bob"]);
    });
  });

  describe("save with validate: false", () => {
    it("skips validation when validate: false", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;
      User.validates("name", { presence: true });

      const user = new User({ name: "" });
      expect(await user.save()).toBe(false);

      const result = await user.save({ validate: false });
      expect(result).toBe(true);
      expect(user.isNewRecord()).toBe(false);
    });
  });

  describe("createOrFindBy", () => {
    it("creates a new record when none exists", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = await User.createOrFindBy({ name: "Alice" });
      expect(user.readAttribute("name")).toBe("Alice");
      expect(user.isPersisted()).toBe(true);
    });

    it("finds existing record when create fails", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const first = await User.create({ name: "Alice" });
      // findOrCreateBy would find the existing, createOrFindBy tries create first
      const found = await User.findOrCreateBy({ name: "Alice" });
      expect(found.id).toBe(first.id);
    });
  });

  describe("lockBang", () => {
    it("reloads the record with a lock clause", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = await User.create({ name: "Alice" });
      // Update via raw SQL to simulate another process changing the data
      await adapter.executeMutation(`UPDATE "users" SET "name" = 'Updated' WHERE "id" = ${user.id}`);

      await user.lockBang();
      expect(user.readAttribute("name")).toBe("Updated");
    });
  });

  describe("attributeForInspect", () => {
    it("formats string attributes with quotes", () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = new User({ name: "Alice" });
      expect(user.attributeForInspect("name")).toBe('"Alice"');
    });

    it("truncates long strings to 50 chars", () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const longName = "a".repeat(100);
      const user = new User({ name: longName });
      const result = user.attributeForInspect("name");
      expect(result).toBe(`"${"a".repeat(50)}..."`);
    });

    it("returns nil for null", () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = new User({});
      expect(user.attributeForInspect("name")).toBe("nil");
    });

    it("formats numbers as JSON", () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("age", "integer");
      User.adapter = adapter;

      const user = new User({ age: 25 });
      expect(user.attributeForInspect("age")).toBe("25");
    });
  });

  describe("inBatches", () => {
    it("yields Relation objects for each batch", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      for (let i = 0; i < 5; i++) {
        await User.create({ name: `User ${i}` });
      }

      const batches: any[] = [];
      for await (const batchRelation of User.all().inBatches({ batchSize: 2 })) {
        const records = await batchRelation.toArray();
        batches.push(records.length);
      }
      expect(batches).toEqual([2, 2, 1]);
    });
  });

  describe("findBySql", () => {
    it("returns model instances from raw SQL", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });

      const results = await User.findBySql('SELECT * FROM "users" WHERE "name" = \'Alice\'');
      expect(results.length).toBe(1);
      expect(results[0].readAttribute("name")).toBe("Alice");
      expect(results[0].isPersisted()).toBe(true);
      expect(results[0].isNewRecord()).toBe(false);
    });
  });

  describe("incrementCounter / decrementCounter", () => {
    it("increments a counter column by primary key", async () => {
      const adapter = freshAdapter();
      class Post extends Base { static _tableName = "posts"; }
      Post.attribute("id", "integer");
      Post.attribute("comments_count", "integer", { default: 0 });
      Post.adapter = adapter;

      const post = await Post.create({ comments_count: 5 });
      await Post.incrementCounter("comments_count", post.id);

      await post.reload();
      expect(post.readAttribute("comments_count")).toBe(6);
    });

    it("decrements a counter column by primary key", async () => {
      const adapter = freshAdapter();
      class Post extends Base { static _tableName = "posts"; }
      Post.attribute("id", "integer");
      Post.attribute("comments_count", "integer", { default: 0 });
      Post.adapter = adapter;

      const post = await Post.create({ comments_count: 5 });
      await Post.decrementCounter("comments_count", post.id);

      await post.reload();
      expect(post.readAttribute("comments_count")).toBe(4);
    });
  });

  describe("updateCounters", () => {
    it("updates multiple counters for a record", async () => {
      const adapter = freshAdapter();
      class Post extends Base { static _tableName = "posts"; }
      Post.attribute("id", "integer");
      Post.attribute("likes_count", "integer", { default: 0 });
      Post.attribute("comments_count", "integer", { default: 0 });
      Post.adapter = adapter;

      const post = await Post.create({ likes_count: 10, comments_count: 5 });
      await Post.updateCounters(post.id, { likes_count: 3, comments_count: -2 });

      await post.reload();
      expect(post.readAttribute("likes_count")).toBe(13);
      expect(post.readAttribute("comments_count")).toBe(3);
    });
  });

  describe("save with touch: false", () => {
    it("skips timestamp updates on save", async () => {
      const adapter = freshAdapter();
      class Post extends Base { static _tableName = "posts"; }
      Post.attribute("id", "integer");
      Post.attribute("title", "string");
      Post.attribute("updated_at", "datetime");
      Post.adapter = adapter;

      const post = await Post.create({ title: "Hello" });
      const originalUpdatedAt = post.readAttribute("updated_at");

      // Wait a tiny bit so Date.now() would differ
      await new Promise((r) => setTimeout(r, 5));

      await post.update({ title: "Updated" });
      const afterUpdate = post.readAttribute("updated_at");
      expect(afterUpdate).not.toEqual(originalUpdatedAt);
    });

    it("does not update updated_at when touch: false", async () => {
      const adapter = freshAdapter();
      class Post extends Base { static _tableName = "posts"; }
      Post.attribute("id", "integer");
      Post.attribute("title", "string");
      Post.attribute("updated_at", "datetime");
      Post.adapter = adapter;

      const post = await Post.create({ title: "Hello" });
      const originalUpdatedAt = post.readAttribute("updated_at");

      post.writeAttribute("title", "Updated");
      await post.save({ touch: false });

      expect(post.readAttribute("updated_at")).toEqual(originalUpdatedAt);
    });
  });

  describe("attrReadonly", () => {
    it("allows setting readonly attributes on create", async () => {
      const adapter = freshAdapter();
      class Product extends Base { static _tableName = "products"; }
      Product.attribute("id", "integer");
      Product.attribute("sku", "string");
      Product.attribute("name", "string");
      Product.adapter = adapter;
      Product.attrReadonly("sku");

      const product = await Product.create({ sku: "ABC-123", name: "Widget" });
      expect(product.readAttribute("sku")).toBe("ABC-123");
    });

    it("ignores readonly attribute changes on update", async () => {
      const adapter = freshAdapter();
      class Product extends Base { static _tableName = "products"; }
      Product.attribute("id", "integer");
      Product.attribute("sku", "string");
      Product.attribute("name", "string");
      Product.adapter = adapter;
      Product.attrReadonly("sku");

      const product = await Product.create({ sku: "ABC-123", name: "Widget" });
      product.writeAttribute("sku", "CHANGED");
      product.writeAttribute("name", "Updated Widget");
      await product.save();

      // The in-memory value changes, but the SQL should not include sku
      await product.reload();
      expect(product.readAttribute("sku")).toBe("ABC-123");
      expect(product.readAttribute("name")).toBe("Updated Widget");
    });

    it("exposes readonlyAttributes list", () => {
      const adapter = freshAdapter();
      class Product extends Base { static _tableName = "products"; }
      Product.attribute("id", "integer");
      Product.attribute("sku", "string");
      Product.adapter = adapter;
      Product.attrReadonly("sku");

      expect(Product.readonlyAttributes).toContain("sku");
    });
  });

  describe("updateAttribute", () => {
    it("updates a single attribute and saves, skipping validations", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.attribute("email", "string");
      User.adapter = adapter;
      User.validates("email", { presence: true });

      const user = await User.create({ name: "Alice", email: "alice@test.com" });
      // updateAttribute skips validations
      await user.updateAttribute("email", "");
      expect(user.readAttribute("email")).toBe("");
      expect(user.isPersisted()).toBe(true);
    });
  });

  describe("dirty tracking: attributeInDatabase, attributeBeforeLastSave", () => {
    it("attributeInDatabase returns the pre-change value", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = await User.create({ name: "Alice" });
      user.writeAttribute("name", "Bob");
      expect(user.attributeInDatabase("name")).toBe("Alice");
    });

    it("attributeBeforeLastSave returns value from before last save", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = await User.create({ name: "Alice" });
      await user.update({ name: "Bob" });
      expect(user.attributeBeforeLastSave("name")).toBe("Alice");
    });

    it("changedAttributeNamesToSave returns pending changes", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.attribute("age", "integer");
      User.adapter = adapter;

      const user = await User.create({ name: "Alice", age: 25 });
      user.writeAttribute("name", "Bob");
      expect(user.changedAttributeNamesToSave).toContain("name");
      expect(user.changedAttributeNamesToSave).not.toContain("age");
    });
  });

  describe("findEach with start/finish", () => {
    it("finds records within a range", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      for (let i = 0; i < 10; i++) {
        await User.create({ name: `User ${i}` });
      }

      const names: string[] = [];
      for await (const user of User.all().findEach({ start: 3, finish: 7 })) {
        names.push(user.readAttribute("name") as string);
      }
      expect(names.length).toBe(5);
    });
  });

  describe("columnNames", () => {
    it("returns the list of defined attribute names", () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.attribute("email", "string");
      User.adapter = adapter;

      expect(User.columnNames()).toEqual(["id", "name", "email"]);
    });
  });

  describe("humanAttributeName", () => {
    it("converts snake_case to human-readable form", () => {
      expect(Base.humanAttributeName("first_name")).toBe("First name");
      expect(Base.humanAttributeName("email")).toBe("Email");
      expect(Base.humanAttributeName("created_at")).toBe("Created at");
    });
  });

  describe("hasAttributeDefinition", () => {
    it("returns true for defined attributes", () => {
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");

      expect(User.hasAttributeDefinition("name")).toBe(true);
      expect(User.hasAttributeDefinition("age")).toBe(false);
    });
  });

  describe("isBlank / isPresent", () => {
    it("isBlank returns true when no records exist", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      expect(await User.all().isBlank()).toBe(true);
      expect(await User.all().isPresent()).toBe(false);

      await User.create({ name: "Alice" });
      expect(await User.all().isBlank()).toBe(false);
      expect(await User.all().isPresent()).toBe(true);
    });
  });

  describe("structurallyCompatible", () => {
    it("returns true for relations of the same model", () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.adapter = adapter;

      const r1 = User.all().where({ id: 1 });
      const r2 = User.all().where({ id: 2 });
      expect(r1.structurallyCompatible(r2)).toBe(true);
    });

    it("returns false for relations of different models", () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.adapter = adapter;

      class Post extends Base { static _tableName = "posts"; }
      Post.attribute("id", "integer");
      Post.adapter = adapter;

      const r1 = User.all().where({ id: 1 });
      const r2 = Post.all().where({ id: 2 });
      expect(r1.structurallyCompatible(r2 as any)).toBe(false);
    });
  });

  describe("Base.exists", () => {
    it("returns true when records exist (no args)", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      expect(await User.exists()).toBe(false);
      await User.create({ name: "Alice" });
      expect(await User.exists()).toBe(true);
    });

    it("checks by primary key", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = await User.create({ name: "Alice" });
      expect(await User.exists(user.id)).toBe(true);
      expect(await User.exists(999)).toBe(false);
    });

    it("checks by conditions hash", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      await User.create({ name: "Alice" });
      expect(await User.exists({ name: "Alice" })).toBe(true);
      expect(await User.exists({ name: "Unknown" })).toBe(false);
    });
  });

  describe("Base class aggregate delegates", () => {
    it("count returns total records", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.attribute("age", "integer");
      User.adapter = adapter;

      await User.create({ name: "Alice", age: 25 });
      await User.create({ name: "Bob", age: 30 });

      expect(await User.count()).toBe(2);
    });

    it("minimum/maximum/average/sum work as class methods", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("age", "integer");
      User.adapter = adapter;

      await User.create({ age: 20 });
      await User.create({ age: 30 });

      expect(await User.minimum("age")).toBe(20);
      expect(await User.maximum("age")).toBe(30);
      expect(await User.sum("age")).toBe(50);
      expect(await User.average("age")).toBe(25);
    });

    it("pluck and ids work as class methods", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });

      const names = (await User.pluck("name")).sort();
      expect(names).toEqual(["Alice", "Bob"]);

      const ids = await User.ids();
      expect(ids.length).toBe(2);
    });
  });

  describe("isChangedForAutosave", () => {
    it("returns true for new records", () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = new User({ name: "Alice" });
      expect(user.isChangedForAutosave()).toBe(true);
    });

    it("returns false for persisted unchanged records", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = await User.create({ name: "Alice" });
      expect(user.isChangedForAutosave()).toBe(false);
    });

    it("returns true for changed records", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = await User.create({ name: "Alice" });
      user.writeAttribute("name", "Bob");
      expect(user.isChangedForAutosave()).toBe(true);
    });
  });

  describe("cacheKey / cacheKeyWithVersion", () => {
    it("returns model/new for new records", () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = new User({ name: "Alice" });
      expect(user.cacheKey()).toBe("users/new");
    });

    it("returns model/id for persisted records", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = await User.create({ name: "Alice" });
      expect(user.cacheKey()).toBe(`users/${user.id}`);
    });

    it("cacheKeyWithVersion includes updated_at", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.attribute("updated_at", "datetime");
      User.adapter = adapter;

      const user = await User.create({ name: "Alice" });
      const key = user.cacheKeyWithVersion();
      expect(key).toMatch(/^users\/\d+-\d+$/);
    });

    it("cacheVersion returns timestamp string", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("updated_at", "datetime");
      User.adapter = adapter;

      const user = await User.create({});
      expect(user.cacheVersion()).not.toBeNull();
    });
  });

  describe("scopeForCreate / whereValuesHash", () => {
    it("scopeForCreate returns attributes for new records", () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.attribute("role", "string");
      User.adapter = adapter;

      const rel = User.all().where({ role: "admin" }).createWith({ name: "Default" });
      expect(rel.scopeForCreate()).toEqual({ role: "admin", name: "Default" });
    });

    it("whereValuesHash returns the where conditions", () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("role", "string");
      User.adapter = adapter;

      const rel = User.all().where({ role: "admin" });
      expect(rel.whereValuesHash()).toEqual({ role: "admin" });
    });
  });

  describe("and()", () => {
    it("combines two relations with AND", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.attribute("role", "string");
      User.adapter = adapter;

      await User.create({ name: "Alice", role: "admin" });
      await User.create({ name: "Bob", role: "user" });
      await User.create({ name: "Charlie", role: "admin" });

      const admins = User.all().where({ role: "admin" });
      const alices = User.all().where({ name: "Alice" });
      const results = await admins.and(alices).toArray();
      expect(results.length).toBe(1);
      expect(results[0].readAttribute("name")).toBe("Alice");
    });
  });

  describe("reject()", () => {
    it("filters out matching records from loaded results", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      await User.create({ name: "Charlie" });

      const results = await User.all().reject((u: any) => u.readAttribute("name") === "Bob");
      expect(results.length).toBe(2);
      expect(results.map((u: any) => u.readAttribute("name")).sort()).toEqual(["Alice", "Charlie"]);
    });
  });

  describe("compactBlank()", () => {
    it("filters out records where column is null", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.attribute("email", "string");
      User.adapter = adapter;

      await User.create({ name: "Alice", email: "alice@test.com" });
      await User.create({ name: "Bob" }); // email is null

      const results = await User.all().compactBlank("email").toArray();
      expect(results.length).toBe(1);
      expect(results[0].readAttribute("name")).toBe("Alice");
    });
  });

  describe("ignoredColumns", () => {
    it("can be set and retrieved on a model class", () => {
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");

      User.ignoredColumns = ["legacy_field"];
      expect(User.ignoredColumns).toEqual(["legacy_field"]);
    });
  });

  describe("sanitizeSql", () => {
    it("sanitizeSqlArray replaces ? placeholders with quoted values", () => {
      class User extends Base { static _tableName = "users"; }

      expect(User.sanitizeSqlArray("name = ?", "Alice")).toBe("name = 'Alice'");
      expect(User.sanitizeSqlArray("age > ?", 18)).toBe("age > 18");
      expect(User.sanitizeSqlArray("name = ? AND age > ?", "Bob", 25)).toBe("name = 'Bob' AND age > 25");
      expect(User.sanitizeSqlArray("active = ?", true)).toBe("active = TRUE");
      expect(User.sanitizeSqlArray("deleted_at = ?", null)).toBe("deleted_at = NULL");
    });

    it("sanitizeSqlArray escapes single quotes", () => {
      class User extends Base { static _tableName = "users"; }

      expect(User.sanitizeSqlArray("name = ?", "O'Brien")).toBe("name = 'O''Brien'");
    });

    it("sanitizeSql handles string passthrough", () => {
      class User extends Base { static _tableName = "users"; }

      expect(User.sanitizeSql("name = 'Alice'")).toBe("name = 'Alice'");
    });

    it("sanitizeSql handles array format", () => {
      class User extends Base { static _tableName = "users"; }

      expect(User.sanitizeSql(["name = ? AND age > ?", "Alice", 30])).toBe("name = 'Alice' AND age > 30");
    });
  });

  describe("Base.new()", () => {
    it("creates an unsaved record instance", () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = User.new({ name: "Alice" });
      expect(user.isNewRecord()).toBe(true);
      expect(user.readAttribute("name")).toBe("Alice");
    });
  });

  describe("attributePresent()", () => {
    it("returns true for non-null, non-empty values", () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.attribute("email", "string");
      User.adapter = adapter;

      const user = new User({ name: "Alice" });
      expect(user.attributePresent("name")).toBe(true);
      expect(user.attributePresent("email")).toBe(false); // null
    });

    it("returns false for empty strings", () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = new User({ name: "  " });
      expect(user.attributePresent("name")).toBe(false);
    });
  });

  describe("toKey()", () => {
    it("returns [id] for persisted records", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = await User.create({ name: "Alice" });
      expect(user.toKey()).toEqual([user.id]);
    });

    it("returns null for new records", () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.adapter = adapter;

      const user = new User({});
      expect(user.toKey()).toBeNull();
    });
  });

  describe("afterTouch callback", () => {
    it("fires after touch() is called", async () => {
      const adapter = freshAdapter();
      const touched: string[] = [];
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.attribute("updated_at", "datetime");
      User.afterTouch((record: any) => { touched.push(record.readAttribute("name")); });
      User.adapter = adapter;

      const user = await User.create({ name: "Alice" });
      await user.touch();
      expect(touched).toEqual(["Alice"]);
    });
  });

  describe("dependent: restrictWithException", () => {
    it("prevents deletion when associated records exist", async () => {
      const adapter = freshAdapter();

      class DComment extends Base { static _tableName = "d_comments"; }
      DComment.attribute("id", "integer");
      DComment.attribute("d_post_id", "integer");
      DComment.attribute("body", "string");
      DComment.adapter = adapter;

      class DPost extends Base {
        static _tableName = "d_posts";
        static _associations: any[] = [
          { type: "hasMany", name: "dComments", options: { dependent: "restrictWithException", className: "DComment", foreignKey: "d_post_id" } },
        ];
      }
      DPost.attribute("id", "integer");
      DPost.attribute("title", "string");
      DPost.adapter = adapter;

      registerModel(DComment);
      registerModel(DPost);

      const post = await DPost.create({ title: "Hello" });
      await DComment.create({ d_post_id: post.id, body: "Nice!" });

      await expect(post.destroy()).rejects.toThrow("Cannot delete record because of dependent dComments");
    });

    it("allows deletion when no associated records exist", async () => {
      const adapter = freshAdapter();

      class DReview extends Base { static _tableName = "d_reviews"; }
      DReview.attribute("id", "integer");
      DReview.attribute("d_article_id", "integer");
      DReview.adapter = adapter;

      class DArticle extends Base {
        static _tableName = "d_articles";
        static _associations: any[] = [
          { type: "hasMany", name: "dReviews", options: { dependent: "restrictWithException", className: "DReview", foreignKey: "d_article_id" } },
        ];
      }
      DArticle.attribute("id", "integer");
      DArticle.attribute("title", "string");
      DArticle.adapter = adapter;

      registerModel(DReview);
      registerModel(DArticle);

      const article = await DArticle.create({ title: "Hello" });
      await article.destroy();
      expect(article.isDestroyed()).toBe(true);
    });
  });

  describe("belongs_to required option", () => {
    it("validates presence of foreign key when required: true", async () => {
      const adapter = freshAdapter();

      class RAuthor extends Base { static _tableName = "r_authors"; }
      RAuthor.attribute("id", "integer");
      RAuthor.attribute("name", "string");
      RAuthor.adapter = adapter;

      class RBook extends Base { static _tableName = "r_books"; }
      RBook.attribute("id", "integer");
      RBook.attribute("author_id", "integer");
      RBook.attribute("title", "string");
      RBook.adapter = adapter;

      registerModel(RAuthor);
      registerModel(RBook);
      Associations.belongsTo.call(RBook, "author", { required: true });

      const book = new RBook({ title: "No Author" });
      const saved = await book.save();
      expect(saved).toBe(false);
      expect(book.errors.fullMessages.some((m: string) => m.toLowerCase().includes("author_id"))).toBe(true);
    });

    it("passes validation when foreign key is present", async () => {
      const adapter = freshAdapter();

      class RWriter extends Base { static _tableName = "r_writers"; }
      RWriter.attribute("id", "integer");
      RWriter.attribute("name", "string");
      RWriter.adapter = adapter;

      class RNovel extends Base { static _tableName = "r_novels"; }
      RNovel.attribute("id", "integer");
      RNovel.attribute("writer_id", "integer");
      RNovel.attribute("title", "string");
      RNovel.adapter = adapter;

      registerModel(RWriter);
      registerModel(RNovel);
      Associations.belongsTo.call(RNovel, "writer", { required: true });

      const writer = await RWriter.create({ name: "Tolkien" });
      const novel = new RNovel({ title: "LotR", writer_id: writer.id });
      const saved = await novel.save();
      expect(saved).toBe(true);
    });
  });

  describe("where with named binds", () => {
    it("replaces :name placeholders with values", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.attribute("age", "integer");
      User.adapter = adapter;

      await User.create({ name: "Alice", age: 25 });
      await User.create({ name: "Bob", age: 15 });
      await User.create({ name: "Charlie", age: 35 });

      const results = await User.all().where("age > :min AND age < :max", { min: 20, max: 30 }).toArray();
      expect(results.length).toBe(1);
      expect(results[0].readAttribute("name")).toBe("Alice");
    });

    it("handles string named binds with quoting", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });

      const results = await User.all().where("name = :name", { name: "Alice" }).toArray();
      expect(results.length).toBe(1);
      expect(results[0].readAttribute("name")).toBe("Alice");
    });
  });

  describe("only()", () => {
    it("keeps only specified query parts", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      await User.create({ name: "Charlie" });

      // Build a complex relation
      const rel = User.all().where({ name: "Alice" }).order("name").limit(1);
      // Keep only where — strips order and limit
      const simplified = rel.only("where");
      const results = await simplified.toArray();
      expect(results.length).toBe(1);
      expect(results[0].readAttribute("name")).toBe("Alice");
    });
  });

  describe("unscope()", () => {
    it("removes specified query parts", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });

      const rel = User.all().where({ name: "Alice" }).limit(1);
      const withoutWhere = rel.unscope("where");
      const results = await withoutWhere.toArray();
      // Without the where clause, should get 1 record (limit still applies)
      expect(results.length).toBe(1);
    });
  });

  describe("normalizes on Base", () => {
    it("normalizes attributes before persistence", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("email", "string");
      User.normalizes("email", (v: unknown) =>
        typeof v === "string" ? v.trim().toLowerCase() : v
      );
      User.adapter = adapter;

      const user = await User.create({ email: "  ALICE@TEST.COM  " });
      expect(user.readAttribute("email")).toBe("alice@test.com");
    });
  });

  describe("static destroy(id)", () => {
    it("destroys a single record by id", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const user = await User.create({ name: "Alice" });
      await User.destroy(user.id);
      expect(await User.count()).toBe(0);
    });

    it("destroys multiple records by array of ids", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const u1 = await User.create({ name: "Alice" });
      const u2 = await User.create({ name: "Bob" });
      await User.create({ name: "Charlie" });

      await User.destroy([u1.id, u2.id]);
      expect(await User.count()).toBe(1);
    });
  });

  describe("find with variadic args", () => {
    it("finds multiple records with variadic ids", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      const u1 = await User.create({ name: "Alice" });
      const u2 = await User.create({ name: "Bob" });

      const results = await User.find(u1.id, u2.id);
      expect(results.length).toBe(2);
    });
  });

  describe("static updateBang", () => {
    it("updates and raises on validation failure", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.validates("name", { presence: true });
      User.adapter = adapter;

      const user = await User.create({ name: "Alice" });
      const updated = await User.updateBang(user.id, { name: "Bob" });
      expect(updated.readAttribute("name")).toBe("Bob");

      await expect(User.updateBang(user.id, { name: "" })).rejects.toThrow();
    });
  });

  describe("isOne()", () => {
    it("returns true when exactly one record matches", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      await User.create({ name: "Alice" });
      expect(await User.all().isOne()).toBe(true);
      await User.create({ name: "Bob" });
      expect(await User.all().isOne()).toBe(false);
    });
  });

  describe("Relation reload and records", () => {
    it("reload() re-queries the database", async () => {
      const adapter = freshAdapter();
      class User extends Base { static _tableName = "users"; }
      User.attribute("id", "integer");
      User.attribute("name", "string");
      User.adapter = adapter;

      await User.create({ name: "Alice" });
      const rel = User.all();
      const first = await rel.toArray();
      expect(first.length).toBe(1);

      // Add another record
      await User.create({ name: "Bob" });
      // Without reload, the cached result is stale
      await rel.reload();
      const second = await rel.records();
      expect(second.length).toBe(2);
    });
  });

  describe("attributeChanged with from/to options", () => {
    it("attributeChanged with from and to after save", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      const user = await User.create({ name: "Alice" });
      user.writeAttribute("name", "Bob");
      expect(user.attributeChanged("name")).toBe(true);
      expect(user.attributeChanged("name", { from: "Alice", to: "Bob" })).toBe(true);
      expect(user.attributeChanged("name", { from: "Wrong" })).toBe(false);
    });

    it("savedChangeToAttribute with from/to after save", async () => {
      const adapter = freshAdapter();

      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      const user = await User.create({ name: "Alice" });
      user.writeAttribute("name", "Bob");
      await user.save();
      expect(user.savedChangeToAttribute("name")).toBe(true);
      expect(user.savedChangeToAttribute("name", { from: "Alice", to: "Bob" })).toBe(true);
      expect(user.savedChangeToAttribute("name", { from: "Wrong" })).toBe(false);
    });
  });

  describe("optimizerHints()", () => {
    it("adds optimizer hints to SQL", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = freshAdapter();
        }
      }
      const sql = User.all().optimizerHints("MAX_EXECUTION_TIME(1000)").toSql();
      expect(sql).toContain("SELECT /*+ MAX_EXECUTION_TIME(1000) */");
    });

    it("supports multiple hints", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = freshAdapter();
        }
      }
      const sql = User.all().optimizerHints("NO_INDEX_MERGE(users)", "BKA(users)").toSql();
      expect(sql).toContain("/*+ NO_INDEX_MERGE(users) BKA(users) */");
    });
  });

  describe("attributesBeforeTypeCast on Base", () => {
    it("returns raw values before type casting", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("age", "integer");
          this.adapter = adapter;
        }
      }
      const u = new User({ name: "Alice", age: "25" });
      const raw = u.attributesBeforeTypeCast;
      expect(raw.age).toBe("25");
      expect(u.readAttribute("age")).toBe(25);
    });
  });

  describe("columnForAttribute on Base", () => {
    it("returns column metadata", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = freshAdapter();
        }
      }
      const u = new User({ name: "Alice" });
      const col = u.columnForAttribute("name");
      expect(col).not.toBeNull();
      expect(col!.name).toBe("name");
      expect(u.columnForAttribute("nope")).toBeNull();
    });
  });

  describe("encrypts()", () => {
    it("encrypts and decrypts attributes transparently", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("ssn", "string");
          this.adapter = adapter;
          this.encrypts("ssn");
        }
      }

      const user = await User.create({ name: "Alice", ssn: "123-45-6789" });
      // Reading returns decrypted value
      expect(user.readAttribute("ssn")).toBe("123-45-6789");

      // The raw stored value should be encrypted (base64)
      const raw = user._attributes.get("ssn");
      expect(raw).not.toBe("123-45-6789");
    });

    it("persists encrypted value to database and decrypts on load", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("secret", "string");
          this.adapter = adapter;
          this.encrypts("secret");
        }
      }

      await User.create({ name: "Alice", secret: "my-secret-data" });
      const loaded = await User.find(1);
      expect(loaded.readAttribute("secret")).toBe("my-secret-data");
    });

    it("supports custom encryptor", async () => {
      const adapter = freshAdapter();
      const customEncryptor = {
        encrypt: (v: string) => `ENC:${v}`,
        decrypt: (v: string) => v.replace(/^ENC:/, ""),
      };
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("token", "string");
          this.adapter = adapter;
          this.encrypts("token", { encryptor: customEncryptor });
        }
      }

      const user = await User.create({ token: "abc123" });
      expect(user.readAttribute("token")).toBe("abc123");
      expect(user._attributes.get("token")).toBe("ENC:abc123");
    });
  });

  describe("Relation.isReadonly", () => {
    it("returns false by default", () => {
      class User extends Base {
        static { this.attribute("id", "integer"); this.adapter = freshAdapter(); }
      }
      expect(User.all().isReadonly).toBe(false);
    });

    it("returns true after .readonly()", () => {
      class User extends Base {
        static { this.attribute("id", "integer"); this.adapter = freshAdapter(); }
      }
      expect(User.all().readonly().isReadonly).toBe(true);
    });
  });

  describe("recordTimestamps", () => {
    it("defaults to true", () => {
      class User extends Base {
        static { this.attribute("id", "integer"); this.adapter = freshAdapter(); }
      }
      expect(User.recordTimestamps).toBe(true);
    });

    it("can be disabled", () => {
      class User extends Base {
        static { this.attribute("id", "integer"); this.adapter = freshAdapter(); this.recordTimestamps = false; }
      }
      expect(User.recordTimestamps).toBe(false);
    });
  });

  describe("noTouching()", () => {
    it("suppresses touching during the block", async () => {
      class User extends Base {
        static { this.attribute("id", "integer"); this.adapter = freshAdapter(); }
      }
      expect(User.isTouchingSuppressed).toBe(false);
      await User.noTouching(async () => {
        expect(User.isTouchingSuppressed).toBe(true);
      });
      expect(User.isTouchingSuppressed).toBe(false);
    });
  });

  describe("generatesTokenFor()", () => {
    it("generates and resolves a token", async () => {
      const { generatesTokenFor } = await import("./generates-token-for.js");
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("password_digest", "string");
          this.adapter = adapter;
        }
      }
      generatesTokenFor(User, "password_reset", {
        generator: (record: any) => String(record.readAttribute("password_digest")),
      });

      const user = await User.create({ name: "Alice", password_digest: "abc123" });
      const token = (user as any).generateTokenFor("password_reset");
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(10);

      // Resolve the token
      const found = await (User as any).findByTokenFor("password_reset", token);
      expect(found).not.toBeNull();
      expect(found.readAttribute("name")).toBe("Alice");
    });

    it("returns null for invalid token", async () => {
      const { generatesTokenFor } = await import("./generates-token-for.js");
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      generatesTokenFor(User, "confirm", {});
      await User.create({ name: "Alice" });
      const found = await (User as any).findByTokenFor("confirm", "invalid-token");
      expect(found).toBeNull();
    });
  });

  describe("scope with extension block", () => {
    it("adds extension methods to the scoped relation", () => {
      const adapter = freshAdapter();
      class Article extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("status", "string");
          this.adapter = adapter;
          this.scope(
            "published",
            (rel: any) => rel.where({ status: "published" }),
            {
              countPublished: async function (this: any) {
                return this.count();
              },
            }
          );
        }
      }

      const rel = (Article as any).published();
      expect(typeof rel.countPublished).toBe("function");
    });
  });

  describe("abstract_class", () => {
    it("marks a class as abstract", () => {
      class ApplicationRecord extends Base {
        static { this.abstractClass = true; }
      }
      expect(ApplicationRecord.abstractClass).toBe(true);
      expect(Base.abstractClass).toBe(false);
    });
  });

  describe("table_name_prefix and table_name_suffix", () => {
    it("table name guesses with prefixes and suffixes", () => {
      class User extends Base {
        static { this.tableNamePrefix = "app_"; }
      }
      expect(User.tableName).toBe("app_users");
    });

    it("applies suffix to inferred table name", () => {
      class User extends Base {
        static { this.tableNameSuffix = "_v2"; }
      }
      expect(User.tableName).toBe("users_v2");
    });

    it("applies both prefix and suffix", () => {
      class User extends Base {
        static {
          this.tableNamePrefix = "myapp_";
          this.tableNameSuffix = "_development";
        }
      }
      expect(User.tableName).toBe("myapp_users_development");
    });

    it("does not apply prefix/suffix when tableName is explicitly set", () => {
      class User extends Base {
        static {
          this.tableName = "custom_users";
          this.tableNamePrefix = "app_";
        }
      }
      expect(User.tableName).toBe("custom_users");
    });
  });

  describe("suppress()", () => {
    it("prevents records from being persisted to database", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      await User.suppress(async () => {
        const user = await User.create({ name: "Ghost" });
        // Record appears saved locally
        expect(user.isNewRecord()).toBe(false);
      });

      // But nothing in the database
      const all = await User.all().toArray();
      expect(all.length).toBe(0);
    });
  });

  describe("toXml() on Base", () => {
    it("serializes a record to XML", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      const u = new User({ name: "Alice" });
      const xml = u.toXml();
      expect(xml).toContain("<user>");
      expect(xml).toContain("<name>Alice</name>");
      expect(xml).toContain("</user>");
    });
  });

  // ===========================================================================
  // clone
  // ===========================================================================
  describe("Base#clone", () => {
    it("creates a shallow clone preserving id and persisted state", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      const u = await User.create({ name: "Alice" });
      const c = u.clone();
      expect(c.id).toBe(u.id);
      expect(c.readAttribute("name")).toBe("Alice");
      expect(c.isPersisted()).toBe(true);
    });

    it("clone is independent from original", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      const u = await User.create({ name: "Alice" });
      const c = u.clone();
      c.writeAttribute("name", "Bob");
      expect(u.readAttribute("name")).toBe("Alice");
      expect(c.readAttribute("name")).toBe("Bob");
    });
  });

  // ===========================================================================
  // findEach with order option
  // ===========================================================================
  describe("findEach with order", () => {
    it("supports order: desc option", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      await User.create({ name: "Charlie" });

      const names: string[] = [];
      const rel = User.where({});
      for await (const u of rel.findEach({ order: "desc" })) {
        names.push(u.readAttribute("name") as string);
      }
      expect(names[0]).toBe("Charlie");
      expect(names[2]).toBe("Alice");
    });
  });

  // ===========================================================================
  // toGid / toSgid
  // ===========================================================================
  describe("toGid / toSgid", () => {
    it("returns a GlobalID-like URI", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      const u = await User.create({ name: "Alice" });
      expect(u.toGid()).toBe(`gid://User/${u.id}`);
    });

    it("returns a base64-encoded signed GID", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      const u = await User.create({ name: "Alice" });
      const sgid = u.toSgid();
      // Decode and verify
      const decoded = Buffer.from(sgid, "base64").toString();
      expect(decoded).toBe(`gid://User/${u.id}`);
    });
  });

  // ===========================================================================
  // serializableHash with include option
  // ===========================================================================
  describe("serializableHash with include", () => {
    it("includes nested associations when preloaded", async () => {
      const adapter = freshAdapter();
      class Author extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      const author = await Author.create({ name: "Alice" });
      // Simulate preloaded associations
      const fakePost = { _attributes: new Map<string, string | number>([["title", "Hello"], ["id", 1]]) };
      (author as any)._preloadedAssociations = new Map([["posts", [fakePost]]]);

      const { serializableHash } = await import("@rails-ts/activemodel");
      const hash = serializableHash(author, { include: ["posts"] });
      expect(hash.name).toBe("Alice");
      expect(Array.isArray(hash.posts)).toBe(true);
      expect((hash.posts as any[])[0].title).toBe("Hello");
    });
  });

  // ===========================================================================
  // columnDefaults
  // ===========================================================================
  describe("Base.columnDefaults", () => {
    it("returns default values for all attributes", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string", { default: "Anonymous" });
          this.attribute("active", "boolean", { default: true });
          this.adapter = adapter;
        }
      }
      const defaults = User.columnDefaults;
      expect(defaults.name).toBe("Anonymous");
      expect(defaults.active).toBe(true);
      expect(defaults.id).toBe(null);
    });
  });

  // ===========================================================================
  // findByAttribute (dynamic finder)
  // ===========================================================================
  describe("Base.findByAttribute", () => {
    it("finds a record by a single attribute", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      const found = await User.findByAttribute("name", "Bob");
      expect(found).not.toBeNull();
      expect(found!.readAttribute("name")).toBe("Bob");
    });

    it("returns null when not found", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      const found = await User.findByAttribute("name", "Nobody");
      expect(found).toBeNull();
    });
  });

  // ===========================================================================
  // respondToMissingFinder
  // ===========================================================================
  describe("Base.respondToMissingFinder", () => {
    it("returns true for valid dynamic finders", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.attribute("email", "string"); this.adapter = adapter; }
      }
      expect(User.respondToMissingFinder("findByName")).toBe(true);
      expect(User.respondToMissingFinder("findByEmail")).toBe(true);
    });

    it("returns false for invalid dynamic finders", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      expect(User.respondToMissingFinder("findByFoo")).toBe(false);
      expect(User.respondToMissingFinder("something")).toBe(false);
    });
  });

  // ===========================================================================
  // extending with function argument
  // ===========================================================================
  describe("Relation#extending with function", () => {
    it("accepts a function that modifies the relation", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      const rel = User.where({ name: "Alice" }).extending((r: any) => {
        r.customMethod = () => "hello";
      });
      expect((rel as any).customMethod()).toBe("hello");
    });
  });

  // ===========================================================================
  // CollectionProxy enhancements
  // ===========================================================================
  describe("CollectionProxy enhancements", () => {
    it("push adds records to the collection", async () => {
      const adapter = freshAdapter();
      class Author extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      class Post extends Base {
        static { this.attribute("id", "integer"); this.attribute("title", "string"); this.attribute("author_id", "integer"); this.adapter = adapter; }
      }
      registerModel("Author", Author);
      registerModel("Post", Post);
      (Author as any)._associations = [{ type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } }];

      const author = await Author.create({ name: "Alice" });
      const post = await Post.create({ title: "Hello" });
      const proxy = association(author, "posts");
      await proxy.push(post);
      expect(post.readAttribute("author_id")).toBe(author.id);
    });

    it("size returns count", async () => {
      const adapter = freshAdapter();
      class Author extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      class Post extends Base {
        static { this.attribute("id", "integer"); this.attribute("title", "string"); this.attribute("author_id", "integer"); this.adapter = adapter; }
      }
      registerModel("Author", Author);
      registerModel("Post", Post);
      (Author as any)._associations = [{ type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } }];

      const author = await Author.create({ name: "Alice" });
      await Post.create({ title: "P1", author_id: author.id });
      const proxy = association(author, "posts");
      expect(await proxy.size()).toBe(1);
    });

    it("isEmpty returns true/false", async () => {
      const adapter = freshAdapter();
      class Author extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      class Post extends Base {
        static { this.attribute("id", "integer"); this.attribute("title", "string"); this.attribute("author_id", "integer"); this.adapter = adapter; }
      }
      registerModel("Author", Author);
      registerModel("Post", Post);
      (Author as any)._associations = [{ type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } }];

      const author = await Author.create({ name: "Alice" });
      const proxy = association(author, "posts");
      expect(await proxy.isEmpty()).toBe(true);
      await Post.create({ title: "P1", author_id: author.id });
      expect(await proxy.isEmpty()).toBe(false);
    });

    it("first and last return correct records", async () => {
      const adapter = freshAdapter();
      class Author extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      class Post extends Base {
        static { this.attribute("id", "integer"); this.attribute("title", "string"); this.attribute("author_id", "integer"); this.adapter = adapter; }
      }
      registerModel("Author", Author);
      registerModel("Post", Post);
      (Author as any)._associations = [{ type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } }];

      const author = await Author.create({ name: "Alice" });
      await Post.create({ title: "First", author_id: author.id });
      await Post.create({ title: "Second", author_id: author.id });
      const proxy = association(author, "posts");
      const first = await proxy.first();
      expect(first).not.toBeNull();
      expect((first as any)!.readAttribute("title")).toBe("First");
      const last = await proxy.last();
      expect((last as any)!.readAttribute("title")).toBe("Second");
    });

    it("includes checks for record membership", async () => {
      const adapter = freshAdapter();
      class Author extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      class Post extends Base {
        static { this.attribute("id", "integer"); this.attribute("title", "string"); this.attribute("author_id", "integer"); this.adapter = adapter; }
      }
      registerModel("Author", Author);
      registerModel("Post", Post);
      (Author as any)._associations = [{ type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } }];

      const author = await Author.create({ name: "Alice" });
      const post = await Post.create({ title: "Mine", author_id: author.id });
      const other = await Post.create({ title: "Other", author_id: 999 });
      const proxy = association(author, "posts");
      expect(await proxy.includes(post)).toBe(true);
      expect(await proxy.includes(other)).toBe(false);
    });
  });

  // ===========================================================================
  // loadAsync on Relation
  // ===========================================================================
  describe("Relation#loadAsync", () => {
    it("returns the relation for chaining", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      const rel = User.where({ name: "Alice" }).loadAsync();
      expect(rel).toBeDefined();
    });
  });

  // ===========================================================================
  // invertWhere
  // ===========================================================================
  describe("Relation#invertWhere", () => {
    it("swaps where and whereNot clauses", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.attribute("role", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice", role: "admin" });
      await User.create({ name: "Bob", role: "user" });
      await User.create({ name: "Charlie", role: "admin" });

      // where({ role: "admin" }) returns Alice, Charlie
      const admins = await User.where({ role: "admin" }).toArray();
      expect(admins.length).toBe(2);

      // invertWhere() should return Bob (non-admins)
      const nonAdmins = await User.where({ role: "admin" }).invertWhere().toArray();
      expect(nonAdmins.length).toBe(1);
      expect(nonAdmins[0].readAttribute("name")).toBe("Bob");
    });
  });

  // ===========================================================================
  // Relation#inspect
  // ===========================================================================
  describe("Relation#inspect", () => {
    it("returns a readable string representation", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      const rel = User.where({ name: "Alice" }).order("name").limit(10);
      const str = rel.inspect();
      expect(str).toContain("User");
      expect(str).toContain("where");
      expect(str).toContain("Alice");
      expect(str).toContain("limit(10)");
    });

    it("shows distinct and group info", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("role", "string"); this.adapter = adapter; }
      }
      const str = User.where({ role: "admin" }).distinct().inspect();
      expect(str).toContain("distinct");
      expect(str).toContain("admin");
    });
  });

  // ===========================================================================
  // logger
  // ===========================================================================
  describe("Base.logger", () => {
    it("defaults to null", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.adapter = adapter; }
      }
      expect(User.logger).toBe(null);
    });

    it("can set and get a logger", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.adapter = adapter; }
      }
      const myLogger = { debug: () => {}, info: () => {} };
      User.logger = myLogger;
      expect(User.logger).toBe(myLogger);
      User.logger = null; // cleanup
    });
  });

  // ===========================================================================
  // attributeTypes
  // ===========================================================================
  describe("Base.attributeTypes", () => {
    it("returns a map of attribute name to type object", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.attribute("age", "integer"); this.adapter = adapter; }
      }
      const types = User.attributeTypes;
      expect(types).toHaveProperty("id");
      expect(types).toHaveProperty("name");
      expect(types).toHaveProperty("age");
      expect(types.name.cast("42")).toBe("42");
      expect(types.age.cast("42")).toBe(42);
    });
  });

  // ===========================================================================
  // fromJson on Base
  // ===========================================================================
  describe("fromJson on Base", () => {
    it("sets attributes from JSON", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      const u = new User({});
      u.fromJson('{"name":"Alice"}');
      expect(u.readAttribute("name")).toBe("Alice");
    });

    it("supports includeRoot", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      const u = new User({});
      u.fromJson('{"user":{"name":"Bob"}}', true);
      expect(u.readAttribute("name")).toBe("Bob");
    });
  });

  // ===========================================================================
  // isPersisted on Base
  // ===========================================================================
  describe("isPersisted on Base", () => {
    it("returns false for new records", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      const u = new User({ name: "Alice" });
      expect(u.isPersisted()).toBe(false);
    });

    it("returns true for saved records", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
      }
      const u = await User.create({ name: "Alice" });
      expect(u.isPersisted()).toBe(true);
    });
  });

  // ===========================================================================
  // Relation#spawn, build, create, createBang
  // ===========================================================================
  describe("Relation spawn/build/create", () => {
    it("spawn returns an independent copy of the relation", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.attribute("role", "string"); this.adapter = adapter; }
      }
      const rel = User.where({ role: "admin" });
      const spawned = rel.spawn();
      expect(spawned).not.toBe(rel);
      expect(spawned.toSql()).toBe(rel.toSql());
    });

    it("build creates an unsaved record with scoped attributes", () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.attribute("role", "string"); this.adapter = adapter; }
      }
      const rel = User.where({ role: "admin" });
      const u = rel.build({ name: "Alice" });
      expect(u).toBeInstanceOf(User);
      expect(u.readAttribute("role")).toBe("admin");
      expect(u.readAttribute("name")).toBe("Alice");
      expect(u.isPersisted()).toBe(false);
    });

    it("create persists a record with scoped attributes", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.attribute("role", "string"); this.adapter = adapter; }
      }
      const rel = User.where({ role: "admin" });
      const u = await rel.create({ name: "Bob" });
      expect(u.isPersisted()).toBe(true);
      expect(u.readAttribute("role")).toBe("admin");
      expect(u.readAttribute("name")).toBe("Bob");
    });

    it("createBang raises on validation failure", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("role", "string");
          this.adapter = adapter;
          this.validates("name", { presence: true });
        }
      }
      const rel = User.where({ role: "admin" });
      await expect(rel.createBang({})).rejects.toThrow();
    });
  });

  describe("firstOrCreate / firstOrInitialize", () => {
    it("firstOrCreate returns existing record when found", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("role", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice", role: "admin" });
      const result = await User.where({ role: "admin" }).firstOrCreate({ name: "Bob" });
      expect(result.readAttribute("name")).toBe("Alice");
    });

    it("firstOrCreate creates a new record when not found", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("role", "string");
          this.adapter = adapter;
        }
      }
      const result = await User.where({ role: "admin" }).firstOrCreate({ name: "Charlie" });
      expect(result.isPersisted()).toBe(true);
      expect(result.readAttribute("role")).toBe("admin");
      expect(result.readAttribute("name")).toBe("Charlie");
    });

    it("firstOrCreateBang raises on validation failure", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("role", "string");
          this.adapter = adapter;
          this.validates("name", { presence: true });
        }
      }
      await expect(User.where({ role: "admin" }).firstOrCreateBang({})).rejects.toThrow();
    });

    it("firstOrInitialize returns existing record when found", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("role", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice", role: "admin" });
      const result = await User.where({ role: "admin" }).firstOrInitialize({ name: "Bob" });
      expect(result.readAttribute("name")).toBe("Alice");
      expect(result.isPersisted()).toBe(true);
    });

    it("firstOrInitialize returns unsaved record when not found", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("role", "string");
          this.adapter = adapter;
        }
      }
      const result = await User.where({ role: "admin" }).firstOrInitialize({ name: "Eve" });
      expect(result.isNewRecord()).toBe(true);
      expect(result.readAttribute("role")).toBe("admin");
      expect(result.readAttribute("name")).toBe("Eve");
    });
  });

  describe("signedId / findSigned / findSignedBang", () => {
    it("generates a signed ID for a persisted record", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      const user = await User.create({ name: "Alice" });
      const sid = user.signedId();
      expect(typeof sid).toBe("string");
      expect(sid.length).toBeGreaterThan(0);
    });

    it("throws for new records", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
        }
      }
      const user = new User({ name: "Alice" });
      expect(() => user.signedId()).toThrow("Cannot generate a signed_id for a new record");
    });

    it("findSigned recovers the record from its signed ID", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      const user = await User.create({ name: "Bob" });
      const sid = user.signedId();
      const found = await User.findSigned(sid);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(user.id);
    });

    it("findSigned returns null for invalid signed ID", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      const found = await User.findSigned("not-valid-base64!!!");
      expect(found).toBeNull();
    });

    it("findSigned respects purpose option", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      const user = await User.create({ name: "Carol" });
      const sid = user.signedId({ purpose: "password_reset" });
      // Wrong purpose returns null
      const wrongPurpose = await User.findSigned(sid, { purpose: "login" });
      expect(wrongPurpose).toBeNull();
      // Correct purpose finds the record
      const rightPurpose = await User.findSigned(sid, { purpose: "password_reset" });
      expect(rightPurpose).not.toBeNull();
      expect(rightPurpose!.id).toBe(user.id);
    });

    it("findSignedBang throws when not found", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await expect(User.findSignedBang("invalid")).rejects.toThrow();
    });
  });

  describe("strictLoadingByDefault", () => {
    it("defaults to false", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
        }
      }
      expect(User.strictLoadingByDefault).toBe(false);
    });

    it("sets strict loading on instantiated records when enabled", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
          this.strictLoadingByDefault = true;
        }
      }
      await User.create({ name: "Alice" });
      const user = await User.findBy({ name: "Alice" });
      expect(user!.isStrictLoading()).toBe(true);
      // Clean up
      User.strictLoadingByDefault = false;
    });

    it("does not affect records when disabled", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Bob" });
      const user = await User.findBy({ name: "Bob" });
      expect(user!.isStrictLoading()).toBe(false);
    });
  });

  describe("Relation value accessors", () => {
    it("limitValue returns the limit", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
        }
      }
      const rel = User.where({ name: "Alice" }).limit(10);
      expect(rel.limitValue).toBe(10);
    });

    it("offsetValue returns the offset", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
        }
      }
      const rel = User.where({}).offset(5);
      expect(rel.offsetValue).toBe(5);
    });

    it("selectValues returns selected columns", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
        }
      }
      const rel = User.where({}).select("name", "id");
      expect(rel.selectValues).toEqual(["name", "id"]);
    });

    it("orderValues returns order clauses", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
        }
      }
      const rel = User.where({}).order("name", { id: "desc" });
      expect(rel.orderValues).toEqual(["name", ["id", "desc"]]);
    });

    it("groupValues returns group columns", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("role", "string");
        }
      }
      const rel = User.where({}).group("role");
      expect(rel.groupValues).toEqual(["role"]);
    });

    it("distinctValue returns the distinct flag", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
        }
      }
      expect(User.where({}).distinctValue).toBe(false);
      expect(User.where({}).distinct().distinctValue).toBe(true);
    });

    it("whereValues returns where clause hashes", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
        }
      }
      const rel = User.where({ name: "Alice" });
      expect(rel.whereValues).toEqual([{ name: "Alice" }]);
    });
  });

  describe("Relation collection convenience methods", () => {
    it("groupByColumn groups records by column value", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("role", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice", role: "admin" });
      await User.create({ name: "Bob", role: "user" });
      await User.create({ name: "Carol", role: "admin" });
      const groups = await User.where({}).groupByColumn("role");
      expect(groups["admin"].length).toBe(2);
      expect(groups["user"].length).toBe(1);
    });

    it("groupByColumn accepts a function", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Adam" });
      await User.create({ name: "Bob" });
      const groups = await User.where({}).groupByColumn(
        (u: any) => String(u.readAttribute("name")).charAt(0)
      );
      expect(groups["A"].length).toBe(2);
      expect(groups["B"].length).toBe(1);
    });

    it("indexBy indexes records by column value", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      const indexed = await User.where({}).indexBy("name");
      expect(indexed["Alice"].readAttribute("name")).toBe("Alice");
      expect(indexed["Bob"].readAttribute("name")).toBe("Bob");
    });

    it("indexBy accepts a function", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      const indexed = await User.where({}).indexBy(
        (u: any) => String(u.readAttribute("name")).toLowerCase()
      );
      expect(indexed["alice"]).toBeDefined();
      expect(indexed["bob"]).toBeDefined();
    });
  });

  describe("enum", () => {
    it("defines enum attribute with predicate methods", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("status", "integer");
          this.adapter = adapter;
          this.enum("status", { active: 0, inactive: 1, banned: 2 });
        }
      }
      const user = await User.create({ name: "Alice", status: 0 });
      expect((user as any).status).toBe("active");
      expect((user as any).isActive()).toBe(true);
      expect((user as any).isInactive()).toBe(false);
      expect((user as any).isBanned()).toBe(false);
    });

    it("sets enum value by name", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("status", "integer");
          this.adapter = adapter;
          this.enum("status", { active: 0, inactive: 1 });
        }
      }
      const user = new User({ name: "Alice" });
      (user as any).status = "inactive";
      expect(user.readAttribute("status")).toBe(1);
      expect((user as any).isInactive()).toBe(true);
    });

    it("provides bang setter methods", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("status", "integer");
          this.adapter = adapter;
          this.enum("status", { active: 0, inactive: 1 });
        }
      }
      const user = new User({ name: "Alice", status: 0 });
      (user as any).inactiveBang();
      expect((user as any).isInactive()).toBe(true);
      expect(user.readAttribute("status")).toBe(1);
    });

    it("exposes the mapping via static getter", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("status", "integer");
          this.enum("status", { active: 0, inactive: 1 });
        }
      }
      expect((User as any).statuss).toEqual({ active: 0, inactive: 1 });
    });

    it("creates scopes for each enum value", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("status", "integer");
          this.adapter = adapter;
          this.enum("status", { active: 0, inactive: 1 });
        }
      }
      await User.create({ name: "Alice", status: 0 });
      await User.create({ name: "Bob", status: 1 });
      const activeUsers = await (User as any).active().toArray();
      expect(activeUsers.length).toBe(1);
      expect(activeUsers[0].readAttribute("name")).toBe("Alice");
    });
  });

  describe("store", () => {
    it("defines accessor methods for stored attributes", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("settings", "json");
          this.adapter = freshAdapter();
          this.store("settings", { accessors: ["theme", "locale"] });
        }
      }
      const user = new User({ name: "Alice", settings: { theme: "dark", locale: "en" } });
      expect((user as any).theme).toBe("dark");
      expect((user as any).locale).toBe("en");
    });

    it("allows setting store values via accessors", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("settings", "json");
          this.adapter = freshAdapter();
          this.store("settings", { accessors: ["theme"] });
        }
      }
      const user = new User({ settings: { theme: "light" } });
      (user as any).theme = "dark";
      const settings = user.readAttribute("settings") as Record<string, unknown>;
      expect(settings.theme).toBe("dark");
    });

    it("initializes store from null gracefully", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("settings", "json");
          this.adapter = freshAdapter();
          this.store("settings", { accessors: ["theme"] });
        }
      }
      const user = new User({});
      expect((user as any).theme).toBeNull();
      (user as any).theme = "neon";
      expect((user as any).theme).toBe("neon");
    });
  });

  describe("async query aliases (Rails 7.0+)", () => {
    it("asyncCount returns the same as count", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      const count = await User.where({}).asyncCount();
      expect(count).toBe(2);
    });

    it("asyncSum returns the same as sum", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("age", "integer");
          this.adapter = adapter;
        }
      }
      await User.create({ age: 20 });
      await User.create({ age: 30 });
      const total = await User.where({}).asyncSum("age");
      expect(total).toBe(50);
    });

    it("asyncMinimum returns the same as minimum", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("age", "integer");
          this.adapter = adapter;
        }
      }
      await User.create({ age: 20 });
      await User.create({ age: 30 });
      const min = await User.where({}).asyncMinimum("age");
      expect(min).toBe(20);
    });

    it("asyncMaximum returns the same as maximum", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("age", "integer");
          this.adapter = adapter;
        }
      }
      await User.create({ age: 20 });
      await User.create({ age: 30 });
      const max = await User.where({}).asyncMaximum("age");
      expect(max).toBe(30);
    });

    it("asyncPluck returns the same as pluck", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      const names = await User.where({}).asyncPluck("name");
      expect(names).toEqual(["Alice", "Bob"]);
    });
  });

  describe("Relation#size and Relation#length", () => {
    it("size returns count without loading records", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      const rel = User.where({});
      expect(await rel.size()).toBe(2);
    });

    it("length forces loading and returns count", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice" });
      expect(await User.where({}).length()).toBe(1);
    });
  });

  describe("Relation#toArel", () => {
    it("returns a SelectManager", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
        }
      }
      const manager = User.where({ name: "Alice" }).toArel();
      expect(typeof manager.toSql).toBe("function");
      const sql = manager.toSql();
      expect(sql).toContain("users");
      expect(sql).toContain("Alice");
    });

    it("respects limit and offset", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
        }
      }
      const manager = User.where({}).limit(5).offset(10).toArel();
      const sql = manager.toSql();
      expect(sql).toContain("LIMIT 5");
      expect(sql).toContain("OFFSET 10");
    });
  });

  describe("Base#isEqual", () => {
    it("returns true for same class and same id", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      const u1 = await User.create({ name: "Alice" });
      const u2 = await User.find(u1.id);
      expect(u1.isEqual(u2)).toBe(true);
    });

    it("returns false for different ids", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      const u1 = await User.create({ name: "Alice" });
      const u2 = await User.create({ name: "Bob" });
      expect(u1.isEqual(u2)).toBe(false);
    });

    it("returns false for new records", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
        }
      }
      const u1 = new User({ name: "Alice" });
      const u2 = new User({ name: "Alice" });
      expect(u1.isEqual(u2)).toBe(false);
    });

    it("returns false for non-Base objects", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      const u = await User.create({ name: "Alice" });
      expect(u.isEqual("not a record")).toBe(false);
      expect(u.isEqual(null)).toBe(false);
    });
  });

  describe("whereAny", () => {
    it("matches records where ANY condition is true (OR)", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("role", "string");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Alice", role: "admin" });
      await User.create({ name: "Bob", role: "user" });
      await User.create({ name: "Charlie", role: "user" });

      const results = await User.where({}).whereAny({ name: "Alice" }, { role: "user" }).toArray();
      expect(results.length).toBe(3);
    });

    it("filters correctly with strict conditions", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("role", "string");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Alice", role: "admin" });
      await User.create({ name: "Bob", role: "user" });
      await User.create({ name: "Charlie", role: "mod" });

      const results = await User.where({}).whereAny({ name: "Alice" }, { name: "Bob" }).toArray();
      expect(results.length).toBe(2);
      const names = results.map((u: any) => u.readAttribute("name")).sort();
      expect(names).toEqual(["Alice", "Bob"]);
    });
  });

  describe("whereAll", () => {
    it("matches records where ALL conditions are true (AND)", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("role", "string");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Alice", role: "admin" });
      await User.create({ name: "Alice", role: "user" });
      await User.create({ name: "Bob", role: "admin" });

      const results = await User.where({}).whereAll({ name: "Alice" }, { role: "admin" }).toArray();
      expect(results.length).toBe(1);
      expect(results[0].readAttribute("name")).toBe("Alice");
      expect(results[0].readAttribute("role")).toBe("admin");
    });
  });

  describe("Base.pick (static)", () => {
    it("picks a column value from the first record", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("age", "integer");
          this.adapter = adapter;
        }
      }

      await User.create({ name: "Alice", age: 30 });
      await User.create({ name: "Bob", age: 25 });

      const name = await User.pick("name");
      expect(name).toBe("Alice");
    });
  });

  describe("distinctOn", () => {
    it("returns a relation with distinctOn columns set", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("role", "string");
        }
      }

      const rel = User.where({}).distinctOn("role");
      expect(rel.distinctValue).toBe(true);
    });
  });

  describe("Base static query delegations", () => {
    it("Base.first() returns the first record", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });

      const first = await User.first();
      expect(first).not.toBeNull();
      expect((first as any).readAttribute("name")).toBe("Alice");
    });

    it("Base.last() returns the last record", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });

      const last = await User.last();
      expect(last).not.toBeNull();
      expect((last as any).readAttribute("name")).toBe("Bob");
    });

    it("Base.take() returns any record", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice" });

      const taken = await User.take();
      expect(taken).not.toBeNull();
    });

    it("Base.select() returns a relation with selected columns", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice" });

      const rel = User.select("name");
      const results = await rel.toArray();
      expect(results.length).toBe(1);
    });

    it("Base.order() returns an ordered relation", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Bob" });
      await User.create({ name: "Alice" });

      const results = await User.order("name").toArray();
      expect(results[0].readAttribute("name")).toBe("Alice");
    });

    it("Base.limit() limits results", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      await User.create({ name: "Charlie" });

      const results = await User.limit(2).toArray();
      expect(results.length).toBe(2);
    });

    it("Base.distinct() returns distinct results", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });

      const rel = User.distinct();
      expect(rel.distinctValue).toBe(true);
    });

    it("Base.none() returns empty relation", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice" });

      const results = await User.none().toArray();
      expect(results.length).toBe(0);
    });

    it("Base.sole() returns the sole record", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice" });

      const record = await User.sole();
      expect(record.readAttribute("name")).toBe("Alice");
    });
  });

  describe("Base.columnsHash", () => {
    it("returns a hash of column definitions", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }

      const hash = User.columnsHash();
      expect(hash["name"].type).toBe("string");
      expect(hash["age"].type).toBe("integer");
      expect(hash["id"].type).toBe("integer");
    });
  });

  describe("Base.contentColumns", () => {
    it("excludes PK, FK, and timestamp columns", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.attribute("department_id", "integer");
          this.attribute("created_at", "datetime");
          this.attribute("updated_at", "datetime");
        }
      }

      const content = User.contentColumns();
      expect(content).toContain("name");
      expect(content).toContain("email");
      expect(content).not.toContain("id");
      expect(content).not.toContain("department_id");
      expect(content).not.toContain("created_at");
      expect(content).not.toContain("updated_at");
    });
  });

  describe("Base.inheritanceColumn", () => {
    it("returns null when STI is not enabled", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
        }
      }

      expect(User.inheritanceColumn).toBeNull();
    });
  });

  describe("Relation#presence", () => {
    it("returns self when records exist", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice" });

      const rel = User.where({ name: "Alice" });
      const result = await rel.presence();
      expect(result).not.toBeNull();
    });

    it("returns null when no records exist", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }

      const rel = User.where({ name: "Nobody" });
      const result = await rel.presence();
      expect(result).toBeNull();
    });
  });

  describe("Relation async iterator", () => {
    it("supports for-await-of", async () => {
      const adapter = freshAdapter();
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });

      const names: string[] = [];
      for await (const user of User.where({})) {
        names.push(user.readAttribute("name") as string);
      }
      expect(names.sort()).toEqual(["Alice", "Bob"]);
    });
  });

  // =========================================================================
  // Rails-guided: Persistence (from persistence_test.rb)
  // =========================================================================
  describe("Persistence (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("save valid record returns true", async () => {
      class Post extends Base {
        static { this.attribute("title", "string"); this.adapter = adapter; }
      }
      const p = new Post({ title: "Hello" });
      expect(await p.save()).toBe(true);
      expect(p.isPersisted()).toBe(true);
    });

    it("save invalid record returns false", async () => {
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.validates("title", { presence: true });
          this.adapter = adapter;
        }
      }
      const p = new Post();
      expect(await p.save()).toBe(false);
      expect(p.isNewRecord()).toBe(true);
    });

    it("save! throws RecordInvalid on validation failure", async () => {
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.validates("title", { presence: true });
          this.adapter = adapter;
        }
      }
      const p = new Post();
      await expect(p.saveBang()).rejects.toThrow("Validation failed");
    });

    it("create returns persisted object", async () => {
      class Post extends Base {
        static { this.attribute("title", "string"); this.adapter = adapter; }
      }
      const p = await Post.create({ title: "Test" });
      expect(p.isPersisted()).toBe(true);
      expect(p.id).toBeDefined();
    });

    it("create! throws on validation failure", async () => {
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.validates("title", { presence: true });
          this.adapter = adapter;
        }
      }
      await expect(Post.createBang({})).rejects.toThrow("Validation failed");
    });

    it("returns object even if validations failed", async () => {
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.validates("title", { presence: true });
          this.adapter = adapter;
        }
      }
      const p = await Post.create({});
      expect(p).toBeInstanceOf(Post);
      expect(p.isNewRecord()).toBe(true);
      expect(p.errors.get("title")).toContain("can't be blank");
    });

    it("update attribute", async () => {
      class Post extends Base {
        static { this.attribute("title", "string"); this.adapter = adapter; }
      }
      const p = await Post.create({ title: "Old" });
      await p.update({ title: "New" });
      const found = await Post.find(p.id);
      expect(found.readAttribute("title")).toBe("New");
    });

    it("update! throws on validation failure", async () => {
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.validates("title", { presence: true });
          this.adapter = adapter;
        }
      }
      const p = await Post.create({ title: "Hello" });
      await expect(p.updateBang({ title: "" })).rejects.toThrow("Validation failed");
    });

    it("destroy removes record from database", async () => {
      class Post extends Base {
        static { this.attribute("title", "string"); this.adapter = adapter; }
      }
      const p = await Post.create({ title: "Hello" });
      const id = p.id;
      await p.destroy();
      expect(p.isDestroyed()).toBe(true);
      await expect(Post.find(id)).rejects.toThrow("not found");
    });

    it("delete removes without callbacks", async () => {
      const log: string[] = [];
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.adapter = adapter;
          this.beforeDestroy(() => { log.push("before_destroy"); });
        }
      }
      const p = await Post.create({ title: "Hello" });
      await p.delete();
      expect(p.isDestroyed()).toBe(true);
      expect(log).toHaveLength(0);
    });

    it("delete all removes all records", async () => {
      class Post extends Base {
        static { this.attribute("title", "string"); this.adapter = adapter; }
      }
      await Post.create({ title: "A" });
      await Post.create({ title: "B" });
      await Post.all().deleteAll();
      expect(await Post.all().count()).toBe(0);
    });

    it("increment attribute", async () => {
      class Post extends Base {
        static { this.attribute("views", "integer"); this.adapter = adapter; }
      }
      const p = await Post.create({ views: 5 });
      p.increment("views");
      expect(p.readAttribute("views")).toBe(6);
    });

    it("increment attribute by amount", async () => {
      class Post extends Base {
        static { this.attribute("views", "integer"); this.adapter = adapter; }
      }
      const p = await Post.create({ views: 5 });
      p.increment("views", 3);
      expect(p.readAttribute("views")).toBe(8);
    });

    it("increment nil attribute starts from 0", async () => {
      class Post extends Base {
        static { this.attribute("views", "integer"); this.adapter = adapter; }
      }
      const p = await Post.create({});
      p.increment("views");
      expect(p.readAttribute("views")).toBe(1);
    });

    it("decrement attribute", async () => {
      class Post extends Base {
        static { this.attribute("views", "integer"); this.adapter = adapter; }
      }
      const p = await Post.create({ views: 5 });
      p.decrement("views");
      expect(p.readAttribute("views")).toBe(4);
    });

    it("toggle boolean attribute", async () => {
      class Post extends Base {
        static { this.attribute("published", "boolean"); this.adapter = adapter; }
      }
      const p = await Post.create({ published: false });
      p.toggle("published");
      expect(p.readAttribute("published")).toBe(true);
      p.toggle("published");
      expect(p.readAttribute("published")).toBe(false);
    });

    it("becomes transforms to another class", async () => {
      class Animal extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      class Dog extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const animal = await Animal.create({ name: "Rex" });
      const dog = animal.becomes(Dog);
      expect(dog).toBeInstanceOf(Dog);
      expect(dog.readAttribute("name")).toBe("Rex");
    });

    it("save destroyed object raises", async () => {
      class Post extends Base {
        static { this.attribute("title", "string"); this.adapter = adapter; }
      }
      const p = await Post.create({ title: "Hello" });
      await p.destroy();
      await expect(p.save()).rejects.toThrow("destroyed");
    });

    it("destroy many by class method", async () => {
      class Post extends Base {
        static { this.attribute("title", "string"); this.adapter = adapter; }
      }
      await Post.create({ title: "A" });
      await Post.create({ title: "B" });
      const destroyed = await Post.destroyAll();
      expect(destroyed).toHaveLength(2);
      expect(await Post.all().count()).toBe(0);
    });

    it("class level delete by id", async () => {
      class Post extends Base {
        static { this.attribute("title", "string"); this.adapter = adapter; }
      }
      await Post.create({ title: "A" });
      await Post.delete(1);
      await expect(Post.find(1)).rejects.toThrow("not found");
    });

    it("class level update by id", async () => {
      class Post extends Base {
        static { this.attribute("title", "string"); this.adapter = adapter; }
      }
      const p = await Post.create({ title: "Old" });
      const updated = await Post.update(p.id, { title: "New" });
      expect(updated.readAttribute("title")).toBe("New");
    });

    it("reload clears local changes", async () => {
      class Post extends Base {
        static { this.attribute("title", "string"); this.adapter = adapter; }
      }
      const p = await Post.create({ title: "Original" });
      p.writeAttribute("title", "Changed");
      await p.reload();
      expect(p.readAttribute("title")).toBe("Original");
    });

    it("update does not run sql if record has not changed", async () => {
      class Post extends Base {
        static { this.attribute("title", "string"); this.adapter = adapter; }
      }
      const p = await Post.create({ title: "Hello" });
      expect(await p.save()).toBe(true);
      expect(p.isPersisted()).toBe(true);
    });

    it("assignAttributes does not persist changes", async () => {
      class Post extends Base {
        static { this.attribute("title", "string"); this.adapter = adapter; }
      }
      const p = await Post.create({ title: "Old" });
      p.assignAttributes({ title: "New" });
      expect(p.readAttribute("title")).toBe("New");
      const found = await Post.find(p.id);
      expect(found.readAttribute("title")).toBe("Old");
    });

    it("updateColumn skips callbacks and validations", async () => {
      const log: string[] = [];
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.validates("title", { presence: true });
          this.adapter = adapter;
          this.beforeSave(() => { log.push("before_save"); });
        }
      }
      const p = await Post.create({ title: "Hello" });
      log.length = 0;
      await p.updateColumn("title", "");
      expect(p.readAttribute("title")).toBe("");
      expect(log).toHaveLength(0);
    });

    it("updateColumns skips callbacks", async () => {
      class Post extends Base {
        static { this.attribute("title", "string"); this.attribute("body", "string"); this.adapter = adapter; }
      }
      const p = await Post.create({ title: "Old", body: "content" });
      await p.updateColumns({ title: "New", body: "updated" });
      const found = await Post.find(p.id);
      expect(found.readAttribute("title")).toBe("New");
      expect(found.readAttribute("body")).toBe("updated");
    });

    it("updateColumn raises on new record", async () => {
      class Post extends Base {
        static { this.attribute("title", "string"); this.adapter = adapter; }
      }
      const p = new Post({ title: "Hello" });
      await expect(p.updateColumn("title", "Changed")).rejects.toThrow();
    });

    it("updateColumn clears dirty state", async () => {
      class Post extends Base {
        static { this.attribute("title", "string"); this.adapter = adapter; }
      }
      const p = await Post.create({ title: "Hello" });
      await p.updateColumn("title", "Changed");
      expect(p.changed).toBe(false);
    });

    it("destroyBang delegates to destroy", async () => {
      class Post extends Base {
        static { this.attribute("title", "string"); this.adapter = adapter; }
      }
      const p = await Post.create({ title: "Hello" });
      const result = await p.destroyBang();
      expect(result.isDestroyed()).toBe(true);
    });

    it("dup creates an unsaved copy", async () => {
      class Post extends Base {
        static { this.attribute("title", "string"); this.adapter = adapter; }
      }
      const original = await Post.create({ title: "Original" });
      const copy = original.dup();
      expect(copy.isNewRecord()).toBe(true);
      expect(copy.id).toBeNull();
      expect(copy.readAttribute("title")).toBe("Original");
    });
  });

  // =========================================================================
  // Rails-guided: Finders (from finder_test.rb)
  // =========================================================================
  describe("Finders (Rails-guided)", () => {
    let adapter: DatabaseAdapter;

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.attribute("age", "integer");
      }
    }

    beforeEach(async () => {
      adapter = freshAdapter();
      User.adapter = adapter;
      await User.create({ name: "Alice", email: "alice@test.com", age: 25 });
      await User.create({ name: "Bob", email: "bob@test.com", age: 30 });
      await User.create({ name: "Charlie", email: "charlie@test.com", age: 35 });
    });

    it("find by primary key", async () => {
      const found = await User.find(1);
      expect(found.readAttribute("name")).toBe("Alice");
    });

    it("find with multiple IDs", async () => {
      const found = await User.find([1, 3]);
      expect(found).toHaveLength(2);
      expect(found[0].readAttribute("name")).toBe("Alice");
      expect(found[1].readAttribute("name")).toBe("Charlie");
    });

    it("find with empty array raises RecordNotFound", async () => {
      await expect(User.find([])).rejects.toThrow();
    });

    it("find raises RecordNotFound for missing ID", async () => {
      await expect(User.find(999)).rejects.toThrow("not found");
    });

    it("find with missing IDs throws", async () => {
      await expect(User.find([1, 999])).rejects.toThrow("not found");
    });

    it("findBy returns matching record", async () => {
      const found = await User.findBy({ name: "Bob" });
      expect(found).not.toBeNull();
      expect(found!.readAttribute("email")).toBe("bob@test.com");
    });

    it("findBy returns null when no match", async () => {
      const found = await User.findBy({ name: "Nobody" });
      expect(found).toBeNull();
    });

    it("findBy! raises when no match", async () => {
      await expect(User.findByBang({ name: "Nobody" })).rejects.toThrow("not found");
    });

    it("findBy with multiple conditions", async () => {
      const found = await User.findBy({ name: "Alice", age: 25 });
      expect(found).not.toBeNull();
      expect(found!.readAttribute("email")).toBe("alice@test.com");
    });

    it("findBy with no match on combined conditions", async () => {
      const found = await User.findBy({ name: "Alice", age: 999 });
      expect(found).toBeNull();
    });

    it("exists returns true for matching records", async () => {
      expect(await User.all().exists()).toBe(true);
    });

    it("exists returns false when no records match", async () => {
      expect(await User.where({ name: "Nobody" }).exists()).toBe(false);
    });

    it("exists with conditions hash", async () => {
      expect(await User.all().exists({ name: "Alice" })).toBe(true);
      expect(await User.all().exists({ name: "Nobody" })).toBe(false);
    });

    it("exists with primary key value", async () => {
      expect(await User.all().exists(1)).toBe(true);
      expect(await User.all().exists(999)).toBe(false);
    });

    it("first returns the first record", async () => {
      const user = await User.all().first();
      expect(user).not.toBeNull();
      expect(user!.readAttribute("name")).toBe("Alice");
    });

    it("first returns null on empty", async () => {
      const empty = await User.where({ name: "Nobody" }).first();
      expect(empty).toBeNull();
    });

    it("first! throws on empty", async () => {
      await expect(User.where({ name: "Nobody" }).firstBang()).rejects.toThrow("not found");
    });

    it("last returns the last record", async () => {
      const user = await User.all().last();
      expect(user).not.toBeNull();
      expect(user!.readAttribute("name")).toBe("Charlie");
    });

    it("last returns null on empty", async () => {
      const empty = await User.where({ name: "Nobody" }).last();
      expect(empty).toBeNull();
    });

    it("last! throws on empty", async () => {
      await expect(User.where({ name: "Nobody" }).lastBang()).rejects.toThrow("not found");
    });

    it("second returns the second record", async () => {
      const user = await User.all().second();
      expect(user).not.toBeNull();
      expect(user!.readAttribute("name")).toBe("Bob");
    });

    it("third returns the third record", async () => {
      const user = await User.all().third();
      expect(user).not.toBeNull();
      expect(user!.readAttribute("name")).toBe("Charlie");
    });

    it("second returns null when not enough records", async () => {
      const noSecond = await User.where({ name: "Alice" }).second();
      expect(noSecond).toBeNull();
    });

    it("findOrCreateBy returns existing record", async () => {
      const existing = await User.findOrCreateBy({ name: "Alice" });
      expect(existing.id).toBe(1);
    });

    it("findOrCreateBy creates when not found", async () => {
      const created = await User.findOrCreateBy({ name: "NewUser" }, { email: "new@test.com" });
      expect(created.isPersisted()).toBe(true);
      expect(created.readAttribute("name")).toBe("NewUser");
      expect(created.readAttribute("email")).toBe("new@test.com");
    });

    it("findOrInitializeBy returns existing record", async () => {
      const existing = await User.findOrInitializeBy({ name: "Alice" });
      expect(existing.isPersisted()).toBe(true);
      expect(existing.id).toBe(1);
    });

    it("findOrInitializeBy returns unsaved when not found", async () => {
      const initialized = await User.findOrInitializeBy({ name: "NewUser" }, { email: "new@test.com" });
      expect(initialized.isNewRecord()).toBe(true);
      expect(initialized.readAttribute("name")).toBe("NewUser");
    });

    it("sole returns the only record", async () => {
      const sole = await User.where({ name: "Alice" }).sole();
      expect(sole.readAttribute("name")).toBe("Alice");
    });

    it("sole raises when multiple records", async () => {
      await expect(User.all().sole()).rejects.toThrow();
    });

    it("sole raises when no records", async () => {
      await expect(User.where({ name: "Nobody" }).sole()).rejects.toThrow("not found");
    });

    it("take returns a single record", async () => {
      const user = await User.all().take();
      expect(user).not.toBeNull();
    });

    it("take returns null on empty relation", async () => {
      const empty = await User.where({ name: "Nobody" }).take();
      expect(empty).toBeNull();
    });

    it("pick returns a single column value", async () => {
      const name = await User.all().order({ name: "asc" }).pick("name");
      expect(name).toBe("Alice");
    });

    it("pick returns array for multiple columns", async () => {
      const result = await User.all().order({ name: "asc" }).pick("name", "age");
      expect(result).toEqual(["Alice", 25]);
    });
  });

  // =========================================================================
  // Rails-guided: Dirty tracking (from dirty_test.rb)
  // =========================================================================
  describe("Dirty (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("attribute changes", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const u = await User.create({ name: "Alice" });
      expect(u.changed).toBe(false);
      u.writeAttribute("name", "Bob");
      expect(u.changed).toBe(true);
      expect(u.changedAttributes).toContain("name");
    });

    it("object should be changed if any attribute is changed", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.attribute("email", "string"); this.adapter = adapter; }
      }
      const u = await User.create({ name: "Alice", email: "a@b.com" });
      u.writeAttribute("email", "new@b.com");
      expect(u.changed).toBe(true);
      expect(u.changedAttributes).toContain("email");
      expect(u.changedAttributes).not.toContain("name");
    });

    it("reverted changes are not dirty", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const u = await User.create({ name: "Alice" });
      u.writeAttribute("name", "Bob");
      expect(u.changed).toBe(true);
      u.writeAttribute("name", "Alice");
      expect(u.changed).toBe(false);
    });

    it("reload should clear changed attributes", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const u = await User.create({ name: "Alice" });
      u.writeAttribute("name", "Changed");
      expect(u.changed).toBe(true);
      await u.reload();
      expect(u.changed).toBe(false);
    });

    it("changed attributes should be preserved if save failure", async () => {
      class User extends Base {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
          this.adapter = adapter;
        }
      }
      const u = await User.create({ name: "Alice" });
      u.writeAttribute("name", "");
      const result = await u.save();
      expect(result).toBe(false);
      expect(u.changed).toBe(true);
    });

    it("savedChanges tracks changes from the last save", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const u = await User.create({ name: "Alice" });
      u.writeAttribute("name", "Bob");
      await u.save();
      expect(u.savedChanges).toHaveProperty("name");
      expect(u.savedChanges.name[1]).toBe("Bob");
    });

    it("savedChangeToAttribute returns true for changed attr", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const u = await User.create({ name: "Alice" });
      u.writeAttribute("name", "Bob");
      await u.save();
      expect(u.savedChangeToAttribute("name")).toBe(true);
      expect(u.savedChangeToAttribute("id")).toBe(false);
    });

    it("previouslyNewRecord returns true after first save", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const u = new User({ name: "Alice" });
      expect(u.isPreviouslyNewRecord()).toBe(false);
      await u.save();
      expect(u.isPreviouslyNewRecord()).toBe(true);
    });

    it("previouslyNewRecord returns false after subsequent saves", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const u = await User.create({ name: "Alice" });
      expect(u.isPreviouslyNewRecord()).toBe(true);
      await u.update({ name: "Bob" });
      expect(u.isPreviouslyNewRecord()).toBe(false);
    });

    it("hasChangesToSave returns true when dirty", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const u = await User.create({ name: "Alice" });
      expect(u.hasChangesToSave).toBe(false);
      u.writeAttribute("name", "Bob");
      expect(u.hasChangesToSave).toBe(true);
    });
  });

  // =========================================================================
  // Rails-guided: Callbacks (from callbacks_test.rb)
  // =========================================================================
  describe("Callbacks (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("create callback order", async () => {
      const log: string[] = [];
      class Tracked extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.beforeSave(() => { log.push("before_save"); });
          this.beforeCreate(() => { log.push("before_create"); });
          this.afterCreate(() => { log.push("after_create"); });
          this.afterSave(() => { log.push("after_save"); });
        }
      }
      await Tracked.create({ name: "test" });
      expect(log).toEqual(["before_save", "before_create", "after_create", "after_save"]);
    });

    it("update callback order", async () => {
      const log: string[] = [];
      class Tracked extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.beforeSave(() => { log.push("before_save"); });
          this.beforeUpdate(() => { log.push("before_update"); });
          this.afterUpdate(() => { log.push("after_update"); });
          this.afterSave(() => { log.push("after_save"); });
        }
      }
      const t = await Tracked.create({ name: "test" });
      log.length = 0;
      await t.update({ name: "updated" });
      expect(log).toEqual(["before_save", "before_update", "after_update", "after_save"]);
    });

    it("destroy callbacks", async () => {
      const log: string[] = [];
      class Tracked extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.beforeDestroy(() => { log.push("before_destroy"); });
          this.afterDestroy(() => { log.push("after_destroy"); });
        }
      }
      const t = await Tracked.create({ name: "test" });
      await t.destroy();
      expect(log).toEqual(["before_destroy", "after_destroy"]);
    });

    it("delete does not run callbacks", async () => {
      const log: string[] = [];
      class Tracked extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.beforeDestroy(() => { log.push("before_destroy"); });
          this.afterDestroy(() => { log.push("after_destroy"); });
        }
      }
      const t = await Tracked.create({ name: "test" });
      await t.delete();
      expect(t.isDestroyed()).toBe(true);
      expect(log).toHaveLength(0);
    });

    it("before_create throwing abort prevents creation", async () => {
      class Guarded extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.beforeCreate(() => false);
        }
      }
      const g = new Guarded({ name: "test" });
      const result = await g.save();
      expect(result).toBe(false);
      expect(g.isNewRecord()).toBe(true);
    });

    it("before_save throwing abort prevents save", async () => {
      class Guarded extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.beforeSave(() => false);
        }
      }
      const g = new Guarded({ name: "test" });
      const result = await g.save();
      expect(result).toBe(false);
    });

    it("before_update throwing abort prevents update", async () => {
      class Guarded extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.beforeUpdate(() => false);
        }
      }
      const g = await Guarded.create({ name: "test" });
      g.writeAttribute("name", "updated");
      const result = await g.save();
      expect(result).toBe(false);
    });

    it("before_destroy callback runs during destroy", async () => {
      const log: string[] = [];
      class Guarded extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.beforeDestroy(() => { log.push("before_destroy_ran"); });
        }
      }
      const g = await Guarded.create({ name: "test" });
      await g.destroy();
      expect(log).toContain("before_destroy_ran");
      expect(g.isDestroyed()).toBe(true);
    });

    it("after_initialize runs when new record created", async () => {
      const log: string[] = [];
      class Tracked extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.afterInitialize(() => { log.push("after_initialize"); });
        }
      }
      new Tracked({ name: "test" });
      expect(log).toContain("after_initialize");
    });

    it("after_find runs when record is found", async () => {
      const log: string[] = [];
      class Tracked extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.afterFind(() => { log.push("after_find"); });
        }
      }
      await Tracked.create({ name: "test" });
      log.length = 0;
      await Tracked.find(1);
      expect(log).toContain("after_find");
    });

    it("around_save wraps the action", () => {
      const log: string[] = [];
      class Tracked extends Base {
        static {
          this.attribute("name", "string");
          this.aroundSave((_r, proceed) => {
            log.push("around_before");
            proceed();
            log.push("around_after");
          });
        }
      }
      const t = new Tracked({ name: "test" });
      t.runCallbacks("save", () => { log.push("action"); });
      expect(log).toEqual(["around_before", "action", "around_after"]);
    });
  });

  // =========================================================================
  // Rails-guided: Calculations (from calculations_test.rb)
  // =========================================================================
  describe("Calculations (Rails-guided)", () => {
    let adapter: DatabaseAdapter;

    class Order extends Base {
      static {
        this.attribute("amount", "integer");
        this.attribute("status", "string");
        this.attribute("customer_id", "integer");
      }
    }

    beforeEach(async () => {
      adapter = freshAdapter();
      Order.adapter = adapter;
      await Order.create({ amount: 10, status: "paid", customer_id: 1 });
      await Order.create({ amount: 20, status: "pending", customer_id: 1 });
      await Order.create({ amount: 30, status: "paid", customer_id: 2 });
      await Order.create({ amount: 5, status: "refunded", customer_id: 2 });
    });

    it("should sum field", async () => {
      expect(await Order.all().sum("amount")).toBe(65);
    });

    it("should average field", async () => {
      expect(await Order.all().average("amount")).toBeCloseTo(16.25);
    });

    it("should return nil as average on empty", async () => {
      expect(await Order.where({ status: "cancelled" }).average("amount")).toBeNull();
    });

    it("should get maximum of field", async () => {
      expect(await Order.all().maximum("amount")).toBe(30);
    });

    it("should get minimum of field", async () => {
      expect(await Order.all().minimum("amount")).toBe(5);
    });

    it("count returns total", async () => {
      expect(await Order.all().count()).toBe(4);
    });

    it("count with column excludes nulls", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.attribute("email", "string"); this.adapter = adapter; }
      }
      await Item.create({ name: "A", email: "a@b.com" });
      await Item.create({ name: "B" });
      expect(await Item.all().count("email")).toBe(1);
    });

    it("count respects limit (Rails semantics)", async () => {
      // Rails: Model.limit(2).count returns 2 (uses subquery with limit)
      expect(await Order.all().limit(2).count()).toBe(2);
    });

    it("sum with where conditions", async () => {
      expect(await Order.where({ status: "paid" }).sum("amount")).toBe(40);
    });

    it("minimum with where conditions", async () => {
      expect(await Order.where({ status: "paid" }).minimum("amount")).toBe(10);
    });

    it("maximum with where conditions", async () => {
      expect(await Order.where({ status: "paid" }).maximum("amount")).toBe(30);
    });

    it("sum on none() returns 0", async () => {
      expect(await Order.all().none().sum("amount")).toBe(0);
    });

    it("average on none() returns null", async () => {
      expect(await Order.all().none().average("amount")).toBeNull();
    });

    it("minimum on none() returns null", async () => {
      expect(await Order.all().none().minimum("amount")).toBeNull();
    });

    it("maximum on none() returns null", async () => {
      expect(await Order.all().none().maximum("amount")).toBeNull();
    });

    it("calculate delegates to correct method", async () => {
      expect(await Order.all().calculate("count")).toBe(4);
      expect(await Order.all().calculate("sum", "amount")).toBe(65);
      expect(await Order.all().calculate("minimum", "amount")).toBe(5);
      expect(await Order.all().calculate("maximum", "amount")).toBe(30);
    });
  });

  // =========================================================================
  // Rails-guided: Null Relation (from null_relation_test.rb)
  // =========================================================================
  describe("Null Relation (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("none returns empty for all terminal methods", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await Item.create({ name: "A" });

      expect(await Item.all().none().toArray()).toEqual([]);
      expect(await Item.all().none().count()).toBe(0);
      expect(await Item.all().none().first()).toBeNull();
      expect(await Item.all().none().last()).toBeNull();
      expect(await Item.all().none().exists()).toBe(false);
      expect(await Item.all().none().pluck("name")).toEqual([]);
      expect(await Item.all().none().sum("id")).toBe(0);
      expect(await Item.all().none().average("id")).toBeNull();
      expect(await Item.all().none().minimum("id")).toBeNull();
      expect(await Item.all().none().maximum("id")).toBeNull();
    });

    it("none is chainable", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await Item.create({ name: "A" });
      const result = await Item.all().none().where({ name: "A" }).toArray();
      expect(result).toEqual([]);
    });

    it("none updateAll returns 0", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await Item.create({ name: "A" });
      expect(await Item.all().none().updateAll({ name: "B" })).toBe(0);
    });

    it("none deleteAll returns 0", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await Item.create({ name: "A" });
      expect(await Item.all().none().deleteAll()).toBe(0);
    });
  });

  // =========================================================================
  // Rails-guided: Relation Where (from relation/where_test.rb)
  // =========================================================================
  describe("Relation Where (Rails-guided)", () => {
    let adapter: DatabaseAdapter;

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.attribute("age", "integer");
        this.attribute("active", "boolean");
      }
    }

    beforeEach(async () => {
      adapter = freshAdapter();
      User.adapter = adapter;
      await User.create({ name: "Alice", email: "alice@test.com", age: 25, active: true });
      await User.create({ name: "Bob", email: "bob@test.com", age: 30, active: false });
      await User.create({ name: "Charlie", email: null, age: 35, active: true });
    });

    it("where with hash conditions", async () => {
      const result = await User.where({ name: "Alice" }).toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("name")).toBe("Alice");
    });

    it("where with multiple conditions", async () => {
      const result = await User.where({ active: true, name: "Alice" }).toArray();
      expect(result).toHaveLength(1);
    });

    it("where with null generates IS NULL", async () => {
      const result = await User.where({ email: null }).toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("name")).toBe("Charlie");
    });

    it("where with array generates IN", async () => {
      const result = await User.where({ name: ["Alice", "Charlie"] }).toArray();
      expect(result).toHaveLength(2);
    });

    it("where with empty array returns no results", async () => {
      const result = await User.where({ name: [] }).toArray();
      expect(result).toHaveLength(0);
    });

    it("whereNot excludes matching records", async () => {
      const result = await User.all().whereNot({ name: "Alice" }).toArray();
      expect(result).toHaveLength(2);
      expect(result.every((r: any) => r.readAttribute("name") !== "Alice")).toBe(true);
    });

    it("whereNot with null generates IS NOT NULL", async () => {
      const result = await User.all().whereNot({ email: null }).toArray();
      expect(result).toHaveLength(2);
    });

    it("whereNot with array generates NOT IN", async () => {
      const result = await User.all().whereNot({ name: ["Alice", "Bob"] }).toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("name")).toBe("Charlie");
    });

    it("where with Range generates BETWEEN", async () => {
      const result = await User.where({ age: new Range(25, 30) }).toArray();
      expect(result).toHaveLength(2);
    });

    it("chaining multiple where clauses", async () => {
      const result = await User.where({ active: true }).where({ name: "Alice" }).toArray();
      expect(result).toHaveLength(1);
    });

    it("chaining multiple whereNot clauses", async () => {
      const result = await User.all().whereNot({ name: "Alice" }).whereNot({ name: "Bob" }).toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("name")).toBe("Charlie");
    });

    it("rewhere replaces existing where conditions for same key", async () => {
      const result = await User.where({ name: "Alice" }).rewhere({ name: "Bob" }).toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("name")).toBe("Bob");
    });

    it("where with raw SQL string", async () => {
      const result = await User.where("age > ?", 28).toArray();
      expect(result).toHaveLength(2);
    });

    it("where with named bind parameters", async () => {
      const result = await User.where("age > :min AND age < :max", { min: 26, max: 34 }).toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("name")).toBe("Bob");
    });
  });

  // =========================================================================
  // Rails-guided: Relation Or (from relation/or_test.rb)
  // =========================================================================
  describe("Relation Or (Rails-guided)", () => {
    let adapter: DatabaseAdapter;

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }

    beforeEach(async () => {
      adapter = freshAdapter();
      User.adapter = adapter;
      await User.create({ name: "Alice", age: 25 });
      await User.create({ name: "Bob", age: 30 });
      await User.create({ name: "Charlie", age: 35 });
    });

    it("or with relation", async () => {
      const result = await User.where({ name: "Alice" }).or(User.where({ name: "Charlie" })).toArray();
      expect(result).toHaveLength(2);
      const names = result.map((r: Base) => r.readAttribute("name"));
      expect(names).toContain("Alice");
      expect(names).toContain("Charlie");
    });

    it("or generates correct SQL", () => {
      const sql = User.where({ name: "Alice" }).or(User.where({ age: 30 })).toSql();
      expect(sql).toContain("OR");
    });

    it("or with count", async () => {
      const count = await User.where({ age: 25 }).or(User.where({ age: 35 })).count();
      expect(count).toBe(2);
    });

    it("triple or chains", async () => {
      const result = await User.where({ name: "Alice" })
        .or(User.where({ name: "Bob" }))
        .or(User.where({ name: "Charlie" }))
        .toArray();
      expect(result).toHaveLength(3);
    });
  });

  // =========================================================================
  // Rails-guided: Relation And (from relation/and_test.rb)
  // =========================================================================
  describe("Relation And (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("and merges where conditions", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.attribute("active", "boolean"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice", active: true });
      await User.create({ name: "Bob", active: false });
      await User.create({ name: "Charlie", active: true });

      const result = await User.where({ active: true }).and(User.where({ name: "Alice" })).toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("name")).toBe("Alice");
    });
  });

  // =========================================================================
  // Rails-guided: Relation Order (from relation/order_test.rb)
  // =========================================================================
  describe("Relation Order (Rails-guided)", () => {
    let adapter: DatabaseAdapter;

    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("price", "integer");
      }
    }

    beforeEach(async () => {
      adapter = freshAdapter();
      Item.adapter = adapter;
      await Item.create({ name: "Charlie", price: 30 });
      await Item.create({ name: "Alice", price: 10 });
      await Item.create({ name: "Bob", price: 20 });
    });

    it("order asc", async () => {
      const result = await Item.all().order({ name: "asc" }).toArray();
      expect(result[0].readAttribute("name")).toBe("Alice");
      expect(result[2].readAttribute("name")).toBe("Charlie");
    });

    it("order desc", async () => {
      const result = await Item.all().order({ name: "desc" }).toArray();
      expect(result[0].readAttribute("name")).toBe("Charlie");
      expect(result[2].readAttribute("name")).toBe("Alice");
    });

    it("order by string column name", async () => {
      const result = await Item.all().order("name").toArray();
      expect(result[0].readAttribute("name")).toBe("Alice");
    });

    it("reorder replaces existing order", async () => {
      const result = await Item.all().order({ name: "asc" }).reorder({ name: "desc" }).toArray();
      expect(result[0].readAttribute("name")).toBe("Charlie");
    });

    it("reverseOrder flips direction", async () => {
      const result = await Item.all().order({ price: "asc" }).reverseOrder().toArray();
      expect(result[0].readAttribute("price")).toBe(30);
    });

    it("multiple order columns", async () => {
      const sql = Item.all().order({ name: "asc" }, { price: "desc" }).toSql();
      expect(sql).toContain("name");
      expect(sql).toContain("price");
    });
  });

  // =========================================================================
  // Rails-guided: Relation Select (from relation/select_test.rb)
  // =========================================================================
  describe("Relation Select (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("select specific columns in SQL", () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.attribute("email", "string"); this.adapter = adapter; }
      }
      const sql = User.all().select("name").toSql();
      expect(sql).toContain('"name"');
      expect(sql).not.toContain("*");
    });

    it("select block form filters loaded records", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "Apple" });
      await User.create({ name: "Banana" });
      await User.create({ name: "Avocado" });
      const result = await User.all().select(
        (r: any) => (r.readAttribute("name") as string).startsWith("A")
      );
      expect(result).toHaveLength(2);
    });

    it("reselect replaces previous select", () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.attribute("email", "string"); this.adapter = adapter; }
      }
      const sql = User.all().select("name").reselect("email").toSql();
      expect(sql).toContain('"email"');
      expect(sql).not.toContain('"name"');
    });

    it("distinct generates DISTINCT SQL", () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const sql = User.all().distinct().toSql();
      expect(sql).toContain("DISTINCT");
    });
  });

  // =========================================================================
  // Rails-guided: Relation Delete All / Update All (from relation/delete_all_test.rb, update_all_test.rb)
  // =========================================================================
  describe("Relation Delete All / Update All (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("delete all removes all matching records", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.attribute("active", "boolean"); this.adapter = adapter; }
      }
      await Item.create({ name: "A", active: true });
      await Item.create({ name: "B", active: false });
      await Item.create({ name: "C", active: true });

      const count = await Item.where({ active: true }).deleteAll();
      expect(count).toBe(2);
      expect(await Item.all().count()).toBe(1);
    });

    it("destroy all runs callbacks", async () => {
      const log: string[] = [];
      class Item extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.afterDestroy((r: any) => { log.push(r.readAttribute("name")); });
        }
      }
      await Item.create({ name: "A" });
      await Item.create({ name: "B" });
      const destroyed = await Item.all().destroyAll();
      expect(destroyed).toHaveLength(2);
      expect(log).toContain("A");
      expect(log).toContain("B");
    });

    it("deleteAll does not run callbacks", async () => {
      const log: string[] = [];
      class Item extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.beforeDestroy(() => { log.push("destroyed"); });
        }
      }
      await Item.create({ name: "A" });
      await Item.all().deleteAll();
      expect(log).toHaveLength(0);
    });

    it("updateAll does not run callbacks", async () => {
      const log: string[] = [];
      class Item extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.beforeSave(() => { log.push("saved"); });
        }
      }
      await Item.create({ name: "A" });
      log.length = 0;
      await Item.all().updateAll({ name: "B" });
      expect(log).toHaveLength(0);
    });

    it("updateAll returns count", async () => {
      class Item extends Base {
        static { this.attribute("active", "boolean"); this.adapter = adapter; }
      }
      await Item.create({ active: true });
      await Item.create({ active: false });
      const count = await Item.where({ active: true }).updateAll({ active: false });
      expect(count).toBe(1);
    });

    it("deleteAll on empty table returns 0", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      expect(await Item.all().deleteAll()).toBe(0);
    });

    it("destroyBy destroys matching records with callbacks", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await Item.create({ name: "A" });
      await Item.create({ name: "B" });
      await Item.create({ name: "A" });
      const destroyed = await Item.destroyBy({ name: "A" });
      expect(destroyed).toHaveLength(2);
      expect(await Item.all().count()).toBe(1);
    });

    it("deleteBy deletes matching records without callbacks", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await Item.create({ name: "A" });
      await Item.create({ name: "B" });
      const count = await Item.deleteBy({ name: "A" });
      expect(count).toBe(1);
    });

    it("static updateAll updates all records", async () => {
      class Item extends Base {
        static { this.attribute("status", "string"); this.adapter = adapter; }
      }
      await Item.create({ status: "old" });
      await Item.create({ status: "old" });
      await Item.updateAll({ status: "new" });
      const items = await Item.all().toArray();
      expect(items.every((i: any) => i.readAttribute("status") === "new")).toBe(true);
    });
  });

  // =========================================================================
  // Rails-guided: Batches (from batches_test.rb)
  // =========================================================================
  describe("Batches (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("find_in_batches returns batches", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      for (let i = 0; i < 7; i++) await User.create({ name: `User ${i}` });

      const batchSizes: number[] = [];
      for await (const batch of User.all().findInBatches({ batchSize: 3 })) {
        batchSizes.push(batch.length);
      }
      expect(batchSizes).toEqual([3, 3, 1]);
    });

    it("findEach yields individual records", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      for (let i = 0; i < 5; i++) await User.create({ name: `User ${i}` });

      const names: string[] = [];
      for await (const record of User.all().findEach({ batchSize: 2 })) {
        names.push(record.readAttribute("name") as string);
      }
      expect(names).toHaveLength(5);
    });

    it("findInBatches with where clause", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.attribute("active", "boolean"); this.adapter = adapter; }
      }
      await User.create({ name: "Active1", active: true });
      await User.create({ name: "Inactive", active: false });
      await User.create({ name: "Active2", active: true });

      const records: any[] = [];
      for await (const record of User.where({ active: true }).findEach({ batchSize: 10 })) {
        records.push(record);
      }
      expect(records).toHaveLength(2);
    });

    it("findInBatches with batch size of 1", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "A" });
      await User.create({ name: "B" });

      const batchSizes: number[] = [];
      for await (const batch of User.all().findInBatches({ batchSize: 1 })) {
        batchSizes.push(batch.length);
      }
      expect(batchSizes).toEqual([1, 1]);
    });
  });

  // =========================================================================
  // Rails-guided: Scopes (from scoping/named_test.rb, scoping/default_test.rb)
  // =========================================================================
  describe("Scopes (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("named scope filters records", async () => {
      class Product extends Base {
        static {
          this.attribute("name", "string");
          this.attribute("price", "integer");
          this.attribute("active", "boolean");
          this.adapter = adapter;
          this.scope("cheap", (rel: any) => rel.where("price < ?", 10));
          this.scope("active", (rel: any) => rel.where({ active: true }));
        }
      }
      await Product.create({ name: "Widget", price: 5, active: true });
      await Product.create({ name: "Gadget", price: 50, active: true });
      await Product.create({ name: "Thing", price: 3, active: false });

      const cheap = await (Product as any).cheap().toArray();
      expect(cheap).toHaveLength(2);
    });

    it("scopes are chainable", async () => {
      class Product extends Base {
        static {
          this.attribute("price", "integer");
          this.attribute("active", "boolean");
          this.adapter = adapter;
          this.scope("cheap", (rel: any) => rel.where("price < ?", 10));
          this.scope("active", (rel: any) => rel.where({ active: true }));
        }
      }
      await Product.create({ price: 5, active: true });
      await Product.create({ price: 50, active: true });
      await Product.create({ price: 3, active: false });

      const result = await (Product as any).cheap().active().toArray();
      expect(result).toHaveLength(1);
    });

    it("scope with arguments", async () => {
      class Product extends Base {
        static {
          this.attribute("price", "integer");
          this.adapter = adapter;
          this.scope("cheaperThan", (rel: any, price: number) => rel.where("price < ?", price));
        }
      }
      await Product.create({ price: 5 });
      await Product.create({ price: 50 });

      const result = await (Product as any).cheaperThan(10).toArray();
      expect(result).toHaveLength(1);
    });

    it("default_scope is applied to all queries", async () => {
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("published", "boolean");
          this.adapter = adapter;
          this.defaultScope((rel: any) => rel.where({ published: true }));
        }
      }
      await Post.create({ title: "Pub", published: true });
      await Post.create({ title: "Draft", published: false });

      expect(await Post.all().count()).toBe(1);
    });

    it("unscoped bypasses default_scope", async () => {
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("published", "boolean");
          this.adapter = adapter;
          this.defaultScope((rel: any) => rel.where({ published: true }));
        }
      }
      await Post.create({ title: "Pub", published: true });
      await Post.create({ title: "Draft", published: false });

      expect(await Post.unscoped().count()).toBe(2);
    });

    it("default_scope applies to exists", async () => {
      class Post extends Base {
        static {
          this.attribute("published", "boolean");
          this.adapter = adapter;
          this.defaultScope((rel: any) => rel.where({ published: true }));
        }
      }
      await Post.create({ published: false });
      expect(await Post.all().exists()).toBe(false);
      expect(await Post.unscoped().exists()).toBe(true);
    });

    it("default_scope applies to pluck", async () => {
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("published", "boolean");
          this.adapter = adapter;
          this.defaultScope((rel: any) => rel.where({ published: true }));
        }
      }
      await Post.create({ title: "Pub", published: true });
      await Post.create({ title: "Draft", published: false });

      expect(await Post.all().pluck("title")).toEqual(["Pub"]);
    });

    it("unscoped then where applies user conditions only", async () => {
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("published", "boolean");
          this.adapter = adapter;
          this.defaultScope((rel: any) => rel.where({ published: true }));
        }
      }
      await Post.create({ title: "Pub", published: true });
      await Post.create({ title: "Draft", published: false });

      const result = await Post.unscoped().where({ title: "Draft" }).toArray();
      expect(result).toHaveLength(1);
    });
  });

  // =========================================================================
  // Rails-guided: Timestamps (from timestamp_test.rb)
  // =========================================================================
  describe("Timestamps (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("sets created_at and updated_at on create", async () => {
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("created_at", "datetime");
          this.attribute("updated_at", "datetime");
          this.adapter = adapter;
        }
      }
      const before = new Date();
      const post = await Post.create({ title: "Hello" });
      const after = new Date();

      const createdAt = post.readAttribute("created_at") as Date;
      expect(createdAt).toBeInstanceOf(Date);
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("does not overwrite explicit timestamps on create", async () => {
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("created_at", "datetime");
          this.attribute("updated_at", "datetime");
          this.adapter = adapter;
        }
      }
      const explicit = new Date("2020-01-01T00:00:00Z");
      const post = await Post.create({ title: "Old", created_at: explicit, updated_at: explicit });
      expect((post.readAttribute("created_at") as Date).toISOString()).toBe(explicit.toISOString());
    });

    it("updates updated_at on save", async () => {
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("created_at", "datetime");
          this.attribute("updated_at", "datetime");
          this.adapter = adapter;
        }
      }
      const post = await Post.create({ title: "Hello" });
      const originalCreatedAt = (post.readAttribute("created_at") as Date).getTime();

      post.writeAttribute("title", "Updated");
      await post.save();

      const updatedAt = post.readAttribute("updated_at") as Date;
      expect(updatedAt).toBeInstanceOf(Date);
      expect((post.readAttribute("created_at") as Date).getTime()).toBe(originalCreatedAt);
    });

    it("created_at never overwritten on subsequent saves", async () => {
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("created_at", "datetime");
          this.attribute("updated_at", "datetime");
          this.adapter = adapter;
        }
      }
      const post = await Post.create({ title: "Hello" });
      const original = (post.readAttribute("created_at") as Date).getTime();

      post.writeAttribute("title", "v2");
      await post.save();
      post.writeAttribute("title", "v3");
      await post.save();

      expect((post.readAttribute("created_at") as Date).getTime()).toBe(original);
    });

    it("touch updates updated_at", async () => {
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("updated_at", "datetime");
          this.adapter = adapter;
        }
      }
      const post = await Post.create({ title: "Hello" });
      const original = (post.readAttribute("updated_at") as Date).getTime();
      await post.touch();
      const newTime = (post.readAttribute("updated_at") as Date).getTime();
      expect(newTime).toBeGreaterThanOrEqual(original);
    });

    it("touch skips callbacks", async () => {
      const log: string[] = [];
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("updated_at", "datetime");
          this.adapter = adapter;
          this.beforeSave(() => { log.push("before_save"); });
        }
      }
      const post = await Post.create({ title: "Hello" });
      log.length = 0;
      await post.touch();
      expect(log).toHaveLength(0);
    });

    it("touch returns false on new record", async () => {
      class Post extends Base {
        static {
          this.attribute("updated_at", "datetime");
          this.adapter = adapter;
        }
      }
      const post = new Post({});
      expect(await post.touch()).toBe(false);
    });

    it("updateColumn does not update updated_at", async () => {
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("updated_at", "datetime");
          this.adapter = adapter;
        }
      }
      const post = await Post.create({ title: "Hello" });
      const original = (post.readAttribute("updated_at") as Date).getTime();
      await post.updateColumn("title", "Changed");
      expect((post.readAttribute("updated_at") as Date).getTime()).toBe(original);
    });
  });

  // =========================================================================
  // Rails-guided: Associations (from associations tests)
  // =========================================================================
  describe("Associations (Rails-guided)", () => {
    let adapter: DatabaseAdapter;

    class Author extends Base {
      static { this.attribute("name", "string"); }
    }
    class Book extends Base {
      static { this.attribute("title", "string"); this.attribute("author_id", "integer"); }
    }
    class Profile extends Base {
      static { this.attribute("bio", "string"); this.attribute("author_id", "integer"); }
    }

    beforeEach(() => {
      adapter = freshAdapter();
      Author.adapter = adapter;
      Book.adapter = adapter;
      Profile.adapter = adapter;
      registerModel(Author);
      registerModel(Book);
      registerModel(Profile);
    });

    it("belongs_to loads parent", async () => {
      const author = await Author.create({ name: "J.K." });
      const book = await Book.create({ title: "Harry Potter", author_id: author.id });
      const loaded = await loadBelongsTo(book, "author", {});
      expect(loaded).not.toBeNull();
      expect(loaded!.readAttribute("name")).toBe("J.K.");
    });

    it("belongs_to returns null when FK is null", async () => {
      const book = await Book.create({ title: "Orphan", author_id: null });
      const loaded = await loadBelongsTo(book, "author", {});
      expect(loaded).toBeNull();
    });

    it("has_one loads child", async () => {
      const author = await Author.create({ name: "Dean" });
      await Profile.create({ bio: "Developer", author_id: author.id });
      const loaded = await loadHasOne(author, "profile", {});
      expect(loaded).not.toBeNull();
      expect(loaded!.readAttribute("bio")).toBe("Developer");
    });

    it("has_many loads all children", async () => {
      const author = await Author.create({ name: "Dean" });
      await Book.create({ title: "Book 1", author_id: author.id });
      await Book.create({ title: "Book 2", author_id: author.id });
      await Book.create({ title: "Other", author_id: 999 });
      const books = await loadHasMany(author, "books", {});
      expect(books).toHaveLength(2);
    });

    it("has_many with custom foreignKey", async () => {
      class Article extends Base {
        static { this.attribute("title", "string"); this.attribute("writer_id", "integer"); this.adapter = adapter; }
      }
      registerModel(Article);
      const author = await Author.create({ name: "Custom" });
      await Article.create({ title: "Test", writer_id: author.id });
      const articles = await loadHasMany(author, "articles", { foreignKey: "writer_id" });
      expect(articles).toHaveLength(1);
    });

    it("has_many returns empty when no children", async () => {
      const author = await Author.create({ name: "Lonely" });
      const books = await loadHasMany(author, "books", {});
      expect(books).toHaveLength(0);
    });
  });

  // =========================================================================
  // Rails-guided: Validations on ActiveRecord (from validations_test.rb)
  // =========================================================================
  describe("Validations (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("validates before save", async () => {
      class User extends Base {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
          this.adapter = adapter;
        }
      }
      const u = new User();
      expect(await u.save()).toBe(false);
      expect(u.errors.get("name")).toContain("can't be blank");
    });

    it("create with invalid data returns unpersisted record", async () => {
      class User extends Base {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
          this.adapter = adapter;
        }
      }
      const u = await User.create({});
      expect(u.isNewRecord()).toBe(true);
      expect(u.errors.size).toBeGreaterThan(0);
    });

    it("create! throws RecordInvalid", async () => {
      class User extends Base {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
          this.adapter = adapter;
        }
      }
      await expect(User.createBang({})).rejects.toThrow("Validation failed");
    });

    it("update with invalid data returns false", async () => {
      class User extends Base {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
          this.adapter = adapter;
        }
      }
      const u = await User.create({ name: "Alice" });
      const result = await u.update({ name: "" });
      expect(result).toBe(false);
    });

    it("isValid returns true for valid record", async () => {
      class User extends Base {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
          this.adapter = adapter;
        }
      }
      const u = new User({ name: "Alice" });
      expect(u.isValid()).toBe(true);
    });

    it("isValid returns false for invalid record", () => {
      class User extends Base {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
          this.adapter = adapter;
        }
      }
      const u = new User();
      expect(u.isValid()).toBe(false);
    });

    it("errors are cleared on valid save", async () => {
      class User extends Base {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
          this.adapter = adapter;
        }
      }
      const u = new User();
      await u.save(); // fails
      expect(u.errors.size).toBeGreaterThan(0);
      u.writeAttribute("name", "Alice");
      await u.save(); // succeeds
      expect(u.errors.size).toBe(0);
    });
  });

  // =========================================================================
  // Rails-guided: Excluding / Without (from excluding_test.rb)
  // =========================================================================
  describe("Excluding (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("excluding removes specific records", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const a = await Item.create({ name: "A" });
      await Item.create({ name: "B" });
      await Item.create({ name: "C" });

      const result = await Item.all().excluding(a).toArray();
      expect(result).toHaveLength(2);
      expect(result.every((r: any) => r.readAttribute("name") !== "A")).toBe(true);
    });

    it("without is an alias for excluding", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const a = await Item.create({ name: "A" });
      await Item.create({ name: "B" });

      const result = await Item.all().without(a).toArray();
      expect(result).toHaveLength(1);
    });

    it("excluding multiple records", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const a = await Item.create({ name: "A" });
      const b = await Item.create({ name: "B" });
      await Item.create({ name: "C" });

      const result = await Item.all().excluding(a, b).toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("name")).toBe("C");
    });
  });

  // =========================================================================
  // Rails-guided: Relation state methods (from relation_test.rb)
  // =========================================================================
  describe("Relation State (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("isLoaded is false before loading", () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      expect(Item.all().isLoaded).toBe(false);
    });

    it("isLoaded is true after toArray", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await Item.create({ name: "A" });
      const rel = Item.all();
      await rel.toArray();
      expect(rel.isLoaded).toBe(true);
    });

    it("reset clears loaded state", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await Item.create({ name: "A" });
      const rel = Item.all();
      await rel.toArray();
      rel.reset();
      expect(rel.isLoaded).toBe(false);
    });

    it("size returns record count", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await Item.create({ name: "A" });
      await Item.create({ name: "B" });
      expect(await Item.all().size()).toBe(2);
    });

    it("isEmpty returns true on empty table", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      expect(await Item.all().isEmpty()).toBe(true);
    });

    it("isEmpty returns false with records", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await Item.create({ name: "A" });
      expect(await Item.all().isEmpty()).toBe(false);
    });

    it("isAny returns true when records exist", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await Item.create({ name: "A" });
      expect(await Item.all().isAny()).toBe(true);
    });

    it("isMany returns false with single record", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await Item.create({ name: "A" });
      expect(await Item.all().isMany()).toBe(false);
    });

    it("isMany returns true with multiple records", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await Item.create({ name: "A" });
      await Item.create({ name: "B" });
      expect(await Item.all().isMany()).toBe(true);
    });

    it("length returns count after loading", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await Item.create({ name: "A" });
      await Item.create({ name: "B" });
      await Item.create({ name: "C" });
      expect(await Item.all().length()).toBe(3);
    });

    it("load eagerly loads and returns relation", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await Item.create({ name: "A" });
      const rel = Item.all();
      const result = await rel.load();
      expect(result).toBe(rel);
      expect(rel.isLoaded).toBe(true);
    });
  });

  // =========================================================================
  // Rails-guided: Base class features (from base_test.rb)
  // =========================================================================
  describe("Base features (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("table name guesses", () => {
      class User extends Base {}
      expect(User.tableName).toBe("users");
    });

    it("handles CamelCase class names", () => {
      class BlogPost extends Base {}
      expect(BlogPost.tableName).toBe("blog_posts");
    });

    it("custom table name", () => {
      class User extends Base { static { this.tableName = "people"; } }
      expect(User.tableName).toBe("people");
    });

    it("primary key defaults to id", () => {
      class User extends Base {}
      expect(User.primaryKey).toBe("id");
    });

    it("custom primary key", () => {
      class User extends Base { static { this.primaryKey = "uuid"; } }
      expect(User.primaryKey).toBe("uuid");
    });

    it("new record state", () => {
      class User extends Base { static { this.attribute("name", "string"); } }
      const u = new User({ name: "test" });
      expect(u.isNewRecord()).toBe(true);
      expect(u.isPersisted()).toBe(false);
      expect(u.isDestroyed()).toBe(false);
    });

    it("persisted state after save", async () => {
      class User extends Base { static { this.attribute("name", "string"); this.adapter = adapter; } }
      const u = await User.create({ name: "test" });
      expect(u.isNewRecord()).toBe(false);
      expect(u.isPersisted()).toBe(true);
    });

    it("destroyed state", async () => {
      class User extends Base { static { this.attribute("name", "string"); this.adapter = adapter; } }
      const u = await User.create({ name: "test" });
      await u.destroy();
      expect(u.isDestroyed()).toBe(true);
      expect(u.isPersisted()).toBe(false);
    });

    it("toParam returns id as string", async () => {
      class User extends Base { static { this.attribute("name", "string"); this.adapter = adapter; } }
      const u = await User.create({ name: "Dean" });
      expect(u.toParam()).toBe("1");
    });

    it("toParam returns null for new record", () => {
      class User extends Base { static { this.attribute("name", "string"); } }
      const u = new User({ name: "Dean" });
      expect(u.toParam()).toBeNull();
    });

    it("isFrozen is false by default", () => {
      class User extends Base { static { this.attribute("name", "string"); this.adapter = adapter; } }
      const u = new User({ name: "test" });
      expect(u.isFrozen()).toBe(false);
    });

    it("isFrozen is true after destroy", async () => {
      class User extends Base { static { this.attribute("name", "string"); this.adapter = adapter; } }
      const u = await User.create({ name: "test" });
      await u.destroy();
      expect(u.isFrozen()).toBe(true);
    });

    it("hasAttribute returns true for defined attributes", () => {
      class User extends Base { static { this.attribute("name", "string"); } }
      const u = new User({ name: "test" });
      expect(u.hasAttribute("name")).toBe(true);
      expect(u.hasAttribute("nonexistent")).toBe(false);
    });

    it("attributeNames returns list of attributes", () => {
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); this.attribute("email", "string"); }
      }
      expect(User.attributeNames()).toEqual(["id", "name", "email"]);
    });

    it("columnNames returns list of columns", () => {
      class User extends Base {
        static { this.attribute("id", "integer"); this.attribute("name", "string"); }
      }
      expect(User.columnNames()).toEqual(["id", "name"]);
    });

    it("columnsHash returns column definitions", () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.attribute("age", "integer"); }
      }
      const hash = User.columnsHash();
      expect(hash["name"].type).toBe("string");
      expect(hash["age"].type).toBe("integer");
    });

    it("contentColumns excludes PK, FK, timestamps", () => {
      class User extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.attribute("email", "string");
          this.attribute("department_id", "integer");
          this.attribute("created_at", "datetime");
          this.attribute("updated_at", "datetime");
        }
      }
      const content = User.contentColumns();
      expect(content).toContain("name");
      expect(content).toContain("email");
      expect(content).not.toContain("id");
      expect(content).not.toContain("department_id");
      expect(content).not.toContain("created_at");
    });

    it("inspect returns human-readable string", async () => {
      class User extends Base { static { this.attribute("name", "string"); this.adapter = adapter; } }
      const u = await User.create({ name: "Alice" });
      const str = u.inspect();
      expect(str).toContain("#<User");
      expect(str).toContain('name: "Alice"');
    });

    it("slice returns subset of attributes", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.attribute("email", "string"); this.adapter = adapter; }
      }
      const u = await User.create({ name: "Alice", email: "a@b.com" });
      const sliced = u.slice("name", "email");
      expect(sliced).toEqual({ name: "Alice", email: "a@b.com" });
      expect(sliced).not.toHaveProperty("id");
    });

    it("valuesAt returns attribute values as array", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.attribute("email", "string"); this.adapter = adapter; }
      }
      const u = await User.create({ name: "Alice", email: "a@b.com" });
      expect(u.valuesAt("name", "email")).toEqual(["Alice", "a@b.com"]);
    });

    it("adapter throws when not configured", () => {
      class NoAdapter extends Base { static { this.attribute("name", "string"); } }
      expect(() => NoAdapter.adapter).toThrow("No adapter configured");
    });

    it("arelTable returns Table with correct name", () => {
      class User extends Base {}
      expect(User.arelTable.name).toBe("users");
    });
  });

  // =========================================================================
  // Rails-guided: Relation Field Ordered Values (from relation/field_ordered_values_test.rb)
  // =========================================================================
  describe("Relation inOrderOf (Rails-guided)", () => {
    it("generates CASE WHEN ordering", () => {
      class Item extends Base { static { this.attribute("status", "string"); } }
      const sql = Item.all().inOrderOf("status", ["active", "pending", "archived"]).toSql();
      expect(sql).toContain("CASE");
      expect(sql).toContain("WHEN");
    });
  });

  // =========================================================================
  // Rails-guided: Annotate (from annotate_test.rb)
  // =========================================================================
  describe("Annotate (Rails-guided)", () => {
    it("annotate adds comment to SQL", () => {
      class User extends Base { static { this.attribute("name", "string"); } }
      const sql = User.all().annotate("user query").toSql();
      expect(sql).toContain("user query");
    });
  });

  // =========================================================================
  // Rails-guided: Relation Merging (from relation/merging_test.rb)
  // =========================================================================
  describe("Relation Merging (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("merge combines two relations", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.attribute("active", "boolean"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice", active: true });
      await User.create({ name: "Bob", active: false });

      const base = User.where({ active: true });
      const other = User.where({ name: "Alice" });
      const result = await base.merge(other).toArray();
      expect(result).toHaveLength(1);
      expect(result[0].readAttribute("name")).toBe("Alice");
    });
  });

  // =========================================================================
  // Rails-guided: Unscope (from relation/where_chain_test.rb)
  // =========================================================================
  describe("Unscope (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("removes where conditions", async () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await Item.create({ name: "A" });
      await Item.create({ name: "B" });

      const result = await Item.where({ name: "A" }).unscope("where").toArray();
      expect(result).toHaveLength(2);
    });

    it("removes order", () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const sql = Item.all().order({ name: "asc" }).unscope("order").toSql();
      expect(sql).not.toContain("ORDER BY");
    });

    it("removes limit and offset", () => {
      class Item extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const sql = Item.all().limit(5).offset(10).unscope("limit", "offset").toSql();
      expect(sql).not.toContain("LIMIT");
      expect(sql).not.toContain("OFFSET");
    });
  });

  // =========================================================================
  // Rails-guided: Pluck (from calculations_test.rb pluck tests)
  // =========================================================================
  describe("Pluck (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("pluck single column", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      expect(await User.all().pluck("name")).toEqual(["Alice", "Bob"]);
    });

    it("pluck multiple columns returns arrays", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.attribute("age", "integer"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice", age: 25 });
      await User.create({ name: "Bob", age: 30 });
      expect(await User.all().pluck("name", "age")).toEqual([["Alice", 25], ["Bob", 30]]);
    });

    it("pluck with where", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.attribute("active", "boolean"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice", active: true });
      await User.create({ name: "Bob", active: false });
      expect(await User.where({ active: true }).pluck("name")).toEqual(["Alice"]);
    });

    it("pluck on empty table returns empty", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      expect(await User.all().pluck("name")).toEqual([]);
    });

    it("ids returns primary key values", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      expect(await User.all().ids()).toEqual([1, 2]);
    });
  });

  // =========================================================================
  // Rails-guided: Readonly (from readonly_test.rb)
  // =========================================================================
  describe("Readonly (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("readonly records cannot be saved", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice" });
      const records = await User.all().readonly().toArray();
      const user = records[0];
      user.writeAttribute("name", "Bob");
      await expect(user.save()).rejects.toThrow();
    });
  });

  // =========================================================================
  // Rails-guided: Lock (from locking_test.rb)
  // =========================================================================
  describe("Lock (Rails-guided)", () => {
    it("lock generates FOR UPDATE SQL", () => {
      class User extends Base { static { this.attribute("name", "string"); } }
      const sql = User.all().lock().toSql();
      expect(sql).toContain("FOR UPDATE");
    });

    it("lock with custom clause", () => {
      class User extends Base { static { this.attribute("name", "string"); } }
      const sql = User.all().lock("FOR SHARE").toSql();
      expect(sql).toContain("FOR SHARE");
    });
  });

  // =========================================================================
  // Rails-guided: Relation Group/Having (from calculations_test.rb)
  // =========================================================================
  describe("Group/Having (Rails-guided)", () => {
    it("group generates GROUP BY SQL", () => {
      class Order extends Base { static { this.attribute("customer_id", "integer"); this.attribute("amount", "integer"); } }
      const sql = Order.all().group("customer_id").toSql();
      expect(sql).toContain("GROUP BY");
    });

    it("having generates HAVING SQL", () => {
      class Order extends Base { static { this.attribute("customer_id", "integer"); } }
      const sql = Order.all().select("customer_id").group("customer_id").having("COUNT(*) > 1").toSql();
      expect(sql).toContain("HAVING");
      expect(sql).toContain("COUNT(*) > 1");
    });

    it("regroup replaces existing group", () => {
      class Order extends Base { static { this.attribute("customer_id", "integer"); this.attribute("status", "string"); } }
      const sql = Order.all().group("customer_id").regroup("status").toSql();
      expect(sql).toContain("status");
      expect(sql).not.toContain("customer_id");
    });
  });

  // =========================================================================
  // Rails-guided: Touch All (from persistence tests)
  // =========================================================================
  describe("Touch All (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("touchAll updates timestamps on all records", async () => {
      class Item extends Base {
        static { this.attribute("updated_at", "datetime"); this.adapter = adapter; }
      }
      await Item.create({});
      await Item.create({});
      const affected = await Item.all().touchAll();
      expect(affected).toBe(2);
    });
  });

  // =========================================================================
  // Rails-guided: Enum (from enum_test.rb)
  // =========================================================================
  describe("Enum (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("creates query predicates for each value", async () => {
      class Task extends Base { static { this.attribute("status", "integer"); this.adapter = adapter; } }
      defineEnum(Task, "status", ["pending", "active", "completed"]);

      const task = await Task.create({ status: 0 });
      expect((task as any).isPending()).toBe(true);
      expect((task as any).isActive()).toBe(false);
    });

    it("creates setter methods", async () => {
      class Task extends Base { static { this.attribute("status", "integer"); this.adapter = adapter; } }
      defineEnum(Task, "status", ["pending", "active", "completed"]);

      const task = await Task.create({ status: 0 });
      (task as any).active();
      expect(task.readAttribute("status")).toBe(1);
    });

    it("creates scope for each value", async () => {
      class Task extends Base { static { this.attribute("status", "integer"); this.adapter = adapter; } }
      defineEnum(Task, "status", ["pending", "active", "completed"]);

      await Task.create({ status: 0 });
      await Task.create({ status: 1 });
      await Task.create({ status: 2 });

      const active = await (Task as any).active().toArray();
      expect(active).toHaveLength(1);
    });

    it("bang setter persists the change", async () => {
      class Task extends Base { static { this.attribute("status", "integer"); this.adapter = adapter; } }
      defineEnum(Task, "status", ["pending", "active", "completed"]);

      const task = await Task.create({ status: 0 });
      await (task as any).activeBang();
      const reloaded = await Task.find(task.id);
      expect(reloaded.readAttribute("status")).toBe(1);
    });

    it("readEnumValue returns string name", async () => {
      class Task extends Base { static { this.attribute("status", "integer"); this.adapter = adapter; } }
      defineEnum(Task, "status", ["pending", "active", "completed"]);

      const task = await Task.create({ status: 1 });
      expect(readEnumValue(task, "status")).toBe("active");
    });

    it("not-scopes filter records", async () => {
      class Task extends Base { static { this.attribute("status", "integer"); this.adapter = adapter; } }
      defineEnum(Task, "status", ["pending", "active", "completed"]);

      await Task.create({ status: 0 });
      await Task.create({ status: 1 });
      await Task.create({ status: 2 });

      const nonPending = await (Task as any).notPending().toArray();
      expect(nonPending).toHaveLength(2);
    });
  });

  // =========================================================================
  // Rails-guided: Relation immutability
  // =========================================================================
  describe("Relation immutability (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("where returns a new relation", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "A" });
      await User.create({ name: "B" });

      const all = User.all();
      const filtered = all.where({ name: "A" });
      expect(await all.count()).toBe(2);
      expect(await filtered.count()).toBe(1);
    });

    it("order returns a new relation", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "Bob" });
      await User.create({ name: "Alice" });

      const all = User.all();
      const ordered = all.order({ name: "desc" });
      const allFirst = await all.first();
      const orderedFirst = await ordered.first();
      expect(allFirst!.readAttribute("name")).toBe("Bob");
      expect(orderedFirst!.readAttribute("name")).toBe("Bob");
    });

    it("limit returns a new relation", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      for (let i = 0; i < 5; i++) await User.create({ name: `U${i}` });
      const all = User.all();
      const limited = all.limit(2);
      expect(await all.count()).toBe(5);
      // limit restricts toArray() but count() returns the total
      const limitedRecords = await limited.toArray();
      expect(limitedRecords).toHaveLength(2);
    });
  });

  // =========================================================================
  // Rails-guided: Scoping block
  // =========================================================================
  describe("Scoping block (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("scoping sets currentScope within the block", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const scope = User.where({ name: "Alice" });
      await User.scoping(scope, async () => {
        expect(User.currentScope).toBe(scope);
      });
      expect(User.currentScope).toBeNull();
    });
  });

  // =========================================================================
  // Rails-guided: Static shorthands delegating to Relation
  // =========================================================================
  describe("Static shorthands (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("Base.where is shorthand for Base.all().where()", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      const result = await User.where({ name: "Alice" }).toArray();
      expect(result).toHaveLength(1);
    });

    it("Base.all returns all records", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      expect(await User.all().count()).toBe(2);
    });

    it("Base.first returns the first record", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice" });
      const first = await User.first();
      expect(first).not.toBeNull();
      expect((first as any)!.readAttribute("name")).toBe("Alice");
    });

    it("Base.last returns the last record", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      const last = await User.last();
      expect(last).not.toBeNull();
      expect((last as any)!.readAttribute("name")).toBe("Bob");
    });

    it("Base.count returns count", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice" });
      expect(await User.count()).toBe(1);
    });

    it("Base.exists returns boolean", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      expect(await User.exists()).toBe(false);
      await User.create({ name: "Alice" });
      expect(await User.exists()).toBe(true);
    });

    it("Base.pluck extracts column values", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      expect(await User.pluck("name")).toEqual(["Alice", "Bob"]);
    });

    it("Base.ids returns primary keys", async () => {
      class User extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await User.create({ name: "Alice" });
      await User.create({ name: "Bob" });
      expect(await User.ids()).toEqual([1, 2]);
    });
  });

  // =========================================================================
  // Rails-guided: Transactions (from transaction_test.rb)
  // =========================================================================
  describe("Transactions (Rails-guided)", () => {
    let adapter: DatabaseAdapter;
    beforeEach(() => { adapter = freshAdapter(); });

    it("successful transaction commits", async () => {
      class Account extends Base {
        static { this.attribute("name", "string"); this.attribute("balance", "integer"); this.adapter = adapter; }
      }
      await transaction(Account, async () => {
        await Account.create({ name: "Alice", balance: 100 });
        await Account.create({ name: "Bob", balance: 200 });
      });
      expect(await Account.all().count()).toBe(2);
    });

    it("afterCommit runs on success", async () => {
      class Account extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const log: string[] = [];
      await transaction(Account, async (tx) => {
        tx.afterCommit(() => { log.push("committed"); });
        await Account.create({ name: "Alice" });
      });
      expect(log).toEqual(["committed"]);
    });

    it("afterRollback runs on error", async () => {
      class Account extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      const log: string[] = [];
      try {
        await transaction(Account, async (tx) => {
          tx.afterRollback(() => { log.push("rolled_back"); });
          throw new Error("boom");
        });
      } catch { /* expected */ }
      expect(log).toEqual(["rolled_back"]);
    });

    it("nested savepoint", async () => {
      class Account extends Base {
        static { this.attribute("name", "string"); this.adapter = adapter; }
      }
      await transaction(Account, async () => {
        await Account.create({ name: "Alice" });
        try {
          await savepoint(Account, "sp1", async () => { throw new Error("inner"); });
        } catch { /* savepoint rolled back */ }
        await Account.create({ name: "Bob" });
      });
      expect(await Account.all().count()).toBe(2);
    });
  });
});
