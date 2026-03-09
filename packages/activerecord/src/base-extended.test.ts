import { describe, it, expect, beforeEach } from "vitest";
import {
  Base,
  defineEnum,
  readEnumValue,
  RecordNotFound,
  RecordInvalid,
  ReadOnlyRecord,
} from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// =============================================================================
// BASE TESTS
// =============================================================================

describe("Base (extended)", () => {
  describe("tableName", () => {
    it("infers table name from class name", () => {
      class User extends Base {}
      expect(User.tableName).toBe("users");
    });

    it("pluralizes CamelCase names with underscores", () => {
      class LineItem extends Base {}
      expect(LineItem.tableName).toBe("line_items");
    });

    it("allows explicit table name override", () => {
      class User extends Base {
        static { this.tableName = "legacy_users"; }
      }
      expect(User.tableName).toBe("legacy_users");
    });

    it("supports tableNamePrefix", () => {
      class Widget extends Base {
        static { this._tableNamePrefix = "app_"; }
      }
      expect(Widget.tableName).toBe("app_widgets");
    });

    it("supports tableNameSuffix", () => {
      class Widget extends Base {
        static { this._tableNameSuffix = "_v2"; }
      }
      expect(Widget.tableName).toBe("widgets_v2");
    });

    it("supports both prefix and suffix", () => {
      class Widget extends Base {
        static {
          this._tableNamePrefix = "pre_";
          this._tableNameSuffix = "_suf";
        }
      }
      expect(Widget.tableName).toBe("pre_widgets_suf");
    });

    it("explicit table name ignores prefix/suffix", () => {
      class Widget extends Base {
        static {
          this._tableNamePrefix = "pre_";
          this.tableName = "my_widgets";
        }
      }
      expect(Widget.tableName).toBe("my_widgets");
    });

    it("different subclasses have independent table names", () => {
      class Dog extends Base {}
      class Cat extends Base {}
      expect(Dog.tableName).toBe("dogs");
      expect(Cat.tableName).toBe("cats");
    });
  });

  describe("primaryKey", () => {
    it("defaults to id", () => {
      class Post extends Base {}
      expect(Post.primaryKey).toBe("id");
    });

    it("can be overridden to a custom key", () => {
      class Post extends Base {
        static { this.primaryKey = "post_id"; }
      }
      expect(Post.primaryKey).toBe("post_id");
    });

    it("subclass inherits parent primary key", () => {
      class Animal extends Base {
        static { this.primaryKey = "uuid"; }
      }
      class Dog extends Animal {}
      expect(Dog.primaryKey).toBe("uuid");
    });
  });

  describe("abstractClass", () => {
    it("defaults to false", () => {
      class Foo extends Base {}
      expect(Foo.abstractClass).toBe(false);
    });

    it("can be set to true", () => {
      class ApplicationRecord extends Base {
        static { this.abstractClass = true; }
      }
      expect(ApplicationRecord.abstractClass).toBe(true);
    });

    it("does not inherit to subclass", () => {
      class ApplicationRecord extends Base {
        static { this.abstractClass = true; }
      }
      class User extends ApplicationRecord {}
      expect(User.abstractClass).toBe(false);
    });
  });

  describe("columnNames", () => {
    it("returns defined attribute names", () => {
      class Post extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("body", "string");
        }
      }
      const names = Post.columnNames();
      expect(names).toContain("title");
      expect(names).toContain("body");
    });

    it("returns empty array for model with no attributes", () => {
      class Empty extends Base {}
      expect(Empty.columnNames()).toEqual([]);
    });
  });

  describe("columnsHash", () => {
    it("returns column definitions keyed by name", () => {
      class Post extends Base {
        static { this.attribute("title", "string"); }
      }
      const hash = Post.columnsHash();
      expect(hash.title).toBeDefined();
      expect(hash.title.name).toBe("title");
    });
  });

  describe("contentColumns", () => {
    it("excludes primary key, foreign keys, and timestamps", () => {
      class Post extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("title", "string");
          this.attribute("author_id", "integer");
          this.attribute("created_at", "datetime");
          this.attribute("updated_at", "datetime");
          this.attribute("body", "string");
        }
      }
      const content = Post.contentColumns();
      expect(content).toContain("title");
      expect(content).toContain("body");
      expect(content).not.toContain("id");
      expect(content).not.toContain("author_id");
      expect(content).not.toContain("created_at");
      expect(content).not.toContain("updated_at");
    });
  });

  describe("humanAttributeName", () => {
    it("converts underscored name to human-readable", () => {
      expect(Base.humanAttributeName("first_name")).toBe("First name");
    });

    it("handles single word", () => {
      expect(Base.humanAttributeName("name")).toBe("Name");
    });
  });

  describe("hasAttributeDefinition", () => {
    it("returns true for defined attributes", () => {
      class Post extends Base {
        static { this.attribute("title", "string"); }
      }
      expect(Post.hasAttributeDefinition("title")).toBe(true);
    });

    it("returns false for undefined attributes", () => {
      class Post extends Base {}
      expect(Post.hasAttributeDefinition("missing")).toBe(false);
    });
  });

  describe("arelTable", () => {
    it("returns a Table with correct name", () => {
      class Order extends Base {}
      expect(Order.arelTable.name).toBe("orders");
    });
  });

  describe("inheritance", () => {
    it("subclass inherits attributes from parent", () => {
      class Animal extends Base {
        static { this.attribute("name", "string"); }
      }
      class Dog extends Animal {}
      expect(Dog.columnNames()).toContain("name");
    });
  });

  describe("logger", () => {
    it("defaults to null", () => {
      class Post extends Base {}
      expect(Post.logger).toBeNull();
    });

    it("can be set", () => {
      class Post extends Base {}
      const logger = { debug: () => {} };
      Post.logger = logger;
      expect(Post.logger).toBe(logger);
      Post.logger = null;
    });
  });

  describe("recordTimestamps", () => {
    it("defaults to true", () => {
      class Post extends Base {}
      expect(Post.recordTimestamps).toBe(true);
    });

    it("can be disabled", () => {
      class Post extends Base {
        static { this.recordTimestamps = false; }
      }
      expect(Post.recordTimestamps).toBe(false);
    });
  });

  describe("ignoredColumns", () => {
    it("defaults to empty array", () => {
      class Post extends Base {}
      expect(Post.ignoredColumns).toEqual([]);
    });

    it("can be set", () => {
      class Post extends Base {
        static { this.ignoredColumns = ["legacy_col"]; }
      }
      expect(Post.ignoredColumns).toEqual(["legacy_col"]);
    });
  });

  describe("readonlyAttributes", () => {
    it("defaults to empty", () => {
      class Post extends Base {}
      expect(Post.readonlyAttributes).toEqual([]);
    });

    it("can mark attributes as readonly", () => {
      class Post extends Base {
        static {
          this.attribute("category", "string");
          this.attrReadonly("category");
        }
      }
      expect(Post.readonlyAttributes).toContain("category");
    });
  });

  describe("new (static)", () => {
    it("instantiates a new unsaved record", () => {
      class User extends Base {
        static { this.attribute("name", "string"); }
      }
      const u = User.new({ name: "Alice" });
      expect(u.isNewRecord()).toBe(true);
      expect(u.readAttribute("name")).toBe("Alice");
    });
  });

  describe("adapter", () => {
    it("throws when no adapter is set", () => {
      class Orphan extends Base {}
      expect(() => Orphan.adapter).toThrow("No adapter configured");
    });
  });
});

// =============================================================================
// PERSISTENCE TESTS
// =============================================================================

describe("Persistence (extended)", () => {
  let adapter: DatabaseAdapter;

  class Article extends Base {
    static {
      this.attribute("title", "string");
      this.attribute("body", "string");
      this.attribute("views", "integer");
    }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    Article.adapter = adapter;
  });

  describe("save", () => {
    it("inserts a new record and assigns an id", async () => {
      const a = new Article({ title: "Hello", body: "World" });
      expect(a.isNewRecord()).toBe(true);
      await a.save();
      expect(a.isNewRecord()).toBe(false);
      expect(a.id).toBeTruthy();
    });

    it("updates an existing record", async () => {
      const a = await Article.create({ title: "Old" });
      a.writeAttribute("title", "New");
      await a.save();
      const found = await Article.find(a.id);
      expect(found.readAttribute("title")).toBe("New");
    });

    it("returns false for invalid record", async () => {
      class Validated extends Base {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
          this.adapter = adapter;
        }
      }
      const v = new Validated();
      expect(await v.save()).toBe(false);
    });

    it("can skip validation with validate: false", async () => {
      class Validated extends Base {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
          this.adapter = adapter;
        }
      }
      const v = new Validated();
      const result = await v.save({ validate: false });
      expect(result).toBe(true);
    });
  });

  describe("saveBang", () => {
    it("throws RecordInvalid on validation failure", async () => {
      class Required extends Base {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
          this.adapter = adapter;
        }
      }
      const r = new Required();
      await expect(r.saveBang()).rejects.toThrow();
    });

    it("saves valid record successfully", async () => {
      const a = new Article({ title: "Test" });
      await a.saveBang();
      expect(a.isPersisted()).toBe(true);
    });
  });

  describe("create", () => {
    it("creates and persists a record", async () => {
      const a = await Article.create({ title: "New", body: "Content" });
      expect(a.isPersisted()).toBe(true);
      expect(a.id).toBeTruthy();
    });

    it("creates with empty attributes", async () => {
      const a = await Article.create({});
      expect(a.isPersisted()).toBe(true);
    });
  });

  describe("createBang", () => {
    it("throws on validation failure", async () => {
      class Required extends Base {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
          this.adapter = adapter;
        }
      }
      await expect(Required.createBang({})).rejects.toThrow();
    });

    it("creates valid record", async () => {
      const a = await Article.createBang({ title: "Valid" });
      expect(a.isPersisted()).toBe(true);
    });
  });

  describe("update (instance)", () => {
    it("updates attributes and saves", async () => {
      const a = await Article.create({ title: "Old", body: "Content" });
      await a.update({ title: "New" });
      expect(a.readAttribute("title")).toBe("New");
      const found = await Article.find(a.id);
      expect(found.readAttribute("title")).toBe("New");
    });

    it("returns false on validation failure", async () => {
      class Validated extends Base {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
          this.adapter = adapter;
        }
      }
      const v = await Validated.create({ name: "ok" });
      const result = await v.update({ name: "" });
      expect(result).toBe(false);
    });
  });

  describe("updateBang (instance)", () => {
    it("throws on validation failure", async () => {
      class Validated extends Base {
        static {
          this.attribute("name", "string");
          this.validates("name", { presence: true });
          this.adapter = adapter;
        }
      }
      const v = await Validated.create({ name: "ok" });
      await expect(v.updateBang({ name: "" })).rejects.toThrow();
    });
  });

  describe("update (class method)", () => {
    it("finds and updates a record by id", async () => {
      const a = await Article.create({ title: "Old" });
      await Article.update(a.id, { title: "New" });
      const found = await Article.find(a.id);
      expect(found.readAttribute("title")).toBe("New");
    });
  });

  describe("destroy (instance)", () => {
    it("marks the record as destroyed", async () => {
      const a = await Article.create({ title: "Bye" });
      await a.destroy();
      expect(a.isDestroyed()).toBe(true);
      expect(a.isPersisted()).toBe(false);
    });

    it("freezes the record after destroy", async () => {
      const a = await Article.create({ title: "Bye" });
      await a.destroy();
      expect(a.isFrozen()).toBe(true);
    });

    it("removes the record from database", async () => {
      const a = await Article.create({ title: "Bye" });
      const id = a.id;
      await a.destroy();
      await expect(Article.find(id)).rejects.toThrow();
    });
  });

  describe("destroy (class method)", () => {
    it("destroys by id", async () => {
      const a = await Article.create({ title: "Bye" });
      const id = a.id;
      await Article.destroy(id);
      await expect(Article.find(id)).rejects.toThrow();
    });

    it("destroys multiple ids", async () => {
      const a1 = await Article.create({ title: "One" });
      const a2 = await Article.create({ title: "Two" });
      await Article.destroy([a1.id, a2.id]);
      await expect(Article.find(a1.id)).rejects.toThrow();
      await expect(Article.find(a2.id)).rejects.toThrow();
    });
  });

  describe("delete (instance)", () => {
    it("deletes without callbacks", async () => {
      const log: string[] = [];
      class Tracked extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          this.beforeDestroy(() => { log.push("before_destroy"); });
        }
      }
      const t = await Tracked.create({ name: "test" });
      await t.delete();
      expect(t.isDestroyed()).toBe(true);
      expect(log).toEqual([]); // no callbacks fired
    });
  });

  describe("delete (class method)", () => {
    it("deletes by id without callbacks", async () => {
      const a = await Article.create({ title: "Gone" });
      const id = a.id;
      await Article.delete(id);
      await expect(Article.find(id)).rejects.toThrow();
    });
  });

  describe("reload", () => {
    it("refreshes attributes from database", async () => {
      const a = await Article.create({ title: "Original" });
      const a2 = await Article.find(a.id);
      await a2.update({ title: "Modified" });
      expect(a.readAttribute("title")).toBe("Original");
      await a.reload();
      expect(a.readAttribute("title")).toBe("Modified");
    });

    it("throws if record no longer exists", async () => {
      const a = await Article.create({ title: "Temp" });
      await Article.delete(a.id);
      await expect(a.reload()).rejects.toThrow();
    });
  });

  describe("record state", () => {
    it("new record is not persisted", () => {
      const a = new Article({ title: "test" });
      expect(a.isNewRecord()).toBe(true);
      expect(a.isPersisted()).toBe(false);
      expect(a.isDestroyed()).toBe(false);
    });

    it("saved record is persisted", async () => {
      const a = await Article.create({ title: "test" });
      expect(a.isNewRecord()).toBe(false);
      expect(a.isPersisted()).toBe(true);
    });

    it("destroyed record is not persisted", async () => {
      const a = await Article.create({ title: "test" });
      await a.destroy();
      expect(a.isPersisted()).toBe(false);
      expect(a.isDestroyed()).toBe(true);
    });

    it("previouslyNewRecord is true after first save", async () => {
      const a = new Article({ title: "test" });
      await a.save();
      expect(a.isPreviouslyNewRecord()).toBe(true);
    });
  });

  describe("readonly", () => {
    it("isReadonly defaults to false", () => {
      const a = new Article({ title: "test" });
      expect(a.isReadonly()).toBe(false);
    });

    it("readonlyBang marks record as readonly", () => {
      const a = new Article({ title: "test" });
      a.readonlyBang();
      expect(a.isReadonly()).toBe(true);
    });

    it("readonly record throws on save", async () => {
      const a = await Article.create({ title: "test" });
      a.readonlyBang();
      await expect(a.save()).rejects.toThrow();
    });

    it("readonly record throws on destroy", async () => {
      const a = await Article.create({ title: "test" });
      a.readonlyBang();
      await expect(a.destroy()).rejects.toThrow();
    });
  });

  describe("freeze", () => {
    it("prevents attribute modification", async () => {
      const a = await Article.create({ title: "test" });
      a.freeze();
      expect(() => a.writeAttribute("title", "new")).toThrow("frozen");
    });
  });

  describe("increment / decrement / toggle", () => {
    it("increment increases attribute value", () => {
      const a = new Article({ views: 5 });
      a.increment("views");
      expect(a.readAttribute("views")).toBe(6);
    });

    it("increment with custom amount", () => {
      const a = new Article({ views: 5 });
      a.increment("views", 10);
      expect(a.readAttribute("views")).toBe(15);
    });

    it("decrement decreases attribute value", () => {
      const a = new Article({ views: 5 });
      a.decrement("views");
      expect(a.readAttribute("views")).toBe(4);
    });

    it("toggle flips boolean", () => {
      class Post extends Base {
        static {
          this.attribute("published", "boolean");
        }
      }
      const p = new Post({ published: false });
      p.toggle("published");
      expect(p.readAttribute("published")).toBe(true);
    });

    it("incrementBang persists the change", async () => {
      const a = await Article.create({ title: "test", views: 0 });
      await a.incrementBang("views", 3);
      const found = await Article.find(a.id);
      expect(found.readAttribute("views")).toBe(3);
    });

    it("decrementBang persists the change", async () => {
      const a = await Article.create({ title: "test", views: 10 });
      await a.decrementBang("views", 2);
      const found = await Article.find(a.id);
      expect(found.readAttribute("views")).toBe(8);
    });
  });

  describe("toParam", () => {
    it("returns id as string for persisted record", async () => {
      const a = await Article.create({ title: "test" });
      expect(a.toParam()).toBe(String(a.id));
    });

    it("returns null for new record", () => {
      const a = new Article({ title: "test" });
      expect(a.toParam()).toBeNull();
    });
  });

  describe("inspect", () => {
    it("returns a readable string", async () => {
      const a = await Article.create({ title: "Hello" });
      const str = a.inspect();
      expect(str).toContain("Article");
      expect(str).toContain("title");
    });
  });

  describe("attributeForInspect", () => {
    it("returns nil for null attribute", () => {
      const a = new Article({});
      expect(a.attributeForInspect("title")).toBe("nil");
    });

    it("quotes strings", () => {
      const a = new Article({ title: "Hello" });
      expect(a.attributeForInspect("title")).toBe('"Hello"');
    });

    it("truncates long strings", () => {
      const long = "a".repeat(100);
      const a = new Article({ title: long });
      const result = a.attributeForInspect("title");
      expect(result).toContain("...");
      expect(result.length).toBeLessThan(60);
    });
  });

  describe("cacheKey", () => {
    it("returns table/new for new record", () => {
      const a = new Article({});
      expect(a.cacheKey()).toBe("articles/new");
    });

    it("returns table/id for persisted record", async () => {
      const a = await Article.create({ title: "test" });
      expect(a.cacheKey()).toBe(`articles/${a.id}`);
    });
  });

  describe("slice", () => {
    it("returns a subset of attributes", () => {
      const a = new Article({ title: "Hello", body: "World", views: 5 });
      const sliced = a.slice("title", "views");
      expect(sliced).toEqual({ title: "Hello", views: 5 });
    });
  });

  describe("assignAttributes", () => {
    it("sets attributes without saving", async () => {
      const a = await Article.create({ title: "Old" });
      a.assignAttributes({ title: "New" });
      expect(a.readAttribute("title")).toBe("New");
      const found = await Article.find(a.id);
      expect(found.readAttribute("title")).toBe("Old");
    });
  });

  describe("findOrCreateBy", () => {
    it("finds existing record", async () => {
      const a = await Article.create({ title: "Exists" });
      const found = await Article.findOrCreateBy({ title: "Exists" });
      expect(found.id).toBe(a.id);
    });

    it("creates when not found", async () => {
      const found = await Article.findOrCreateBy({ title: "New" });
      expect(found.isPersisted()).toBe(true);
      expect(found.readAttribute("title")).toBe("New");
    });
  });

  describe("findOrInitializeBy", () => {
    it("finds existing record", async () => {
      const a = await Article.create({ title: "Exists" });
      const found = await Article.findOrInitializeBy({ title: "Exists" });
      expect(found.id).toBe(a.id);
    });

    it("initializes unsaved record when not found", async () => {
      const found = await Article.findOrInitializeBy({ title: "New" });
      expect(found.isNewRecord()).toBe(true);
      expect(found.readAttribute("title")).toBe("New");
    });
  });

  describe("exists (class method)", () => {
    it("returns true when records exist", async () => {
      await Article.create({ title: "test" });
      expect(await Article.exists()).toBe(true);
    });

    it("returns false when no records", async () => {
      expect(await Article.exists()).toBe(false);
    });

    it("accepts conditions", async () => {
      await Article.create({ title: "test" });
      expect(await Article.exists({ title: "test" })).toBe(true);
      expect(await Article.exists({ title: "nope" })).toBe(false);
    });

    it("accepts primary key", async () => {
      const a = await Article.create({ title: "test" });
      expect(await Article.exists(a.id)).toBe(true);
      expect(await Article.exists(9999)).toBe(false);
    });
  });

  describe("suppress", () => {
    it("prevents persistence during block", async () => {
      await Article.suppress(async () => {
        const a = await Article.create({ title: "Ghost" });
        // Record appears saved in memory
        expect(a.isPersisted()).toBe(true);
      });
      // But nothing in the database
      const count = await Article.count();
      expect(count).toBe(0);
    });
  });

  describe("noTouching", () => {
    it("suppresses touching during block", async () => {
      let suppressed = false;
      await Article.noTouching(async () => {
        suppressed = Article.isTouchingSuppressed;
      });
      expect(suppressed).toBe(true);
      expect(Article.isTouchingSuppressed).toBe(false);
    });
  });
});

// =============================================================================
// ATTRIBUTES TESTS
// =============================================================================

describe("Attributes (extended)", () => {
  let adapter: DatabaseAdapter;

  class Person extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("age", "integer");
      this.attribute("email", "string");
      this.attribute("active", "boolean");
    }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    Person.adapter = adapter;
  });

  describe("readAttribute / writeAttribute", () => {
    it("reads and writes attributes", () => {
      const p = new Person({ name: "Alice" });
      expect(p.readAttribute("name")).toBe("Alice");
      p.writeAttribute("name", "Bob");
      expect(p.readAttribute("name")).toBe("Bob");
    });

    it("returns null for unset attributes", () => {
      const p = new Person({});
      expect(p.readAttribute("name")).toBeNull();
    });
  });

  describe("attributes", () => {
    it("returns all attributes as a plain object", () => {
      const p = new Person({ name: "Alice", age: 30 });
      const attrs = p.attributes;
      expect(attrs.name).toBe("Alice");
      expect(attrs.age).toBe(30);
    });
  });

  describe("id", () => {
    it("reads the primary key value", async () => {
      const p = await Person.create({ name: "Alice" });
      expect(p.id).toBeTruthy();
    });

    it("can set id", () => {
      const p = new Person({});
      p.id = 42;
      expect(p.id).toBe(42);
    });
  });

  describe("dirty tracking", () => {
    it("new record starts without changes tracked", () => {
      const p = new Person({ name: "Alice" });
      // In this implementation, new records don't track initial assignment as "changed"
      expect(p.changed).toBe(false);
    });

    it("clears changes after save", async () => {
      const p = await Person.create({ name: "Alice" });
      expect(p.changed).toBe(false);
    });

    it("detects changes after writeAttribute", async () => {
      const p = await Person.create({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      expect(p.changed).toBe(true);
    });
  });

  describe("hasAttribute", () => {
    it("returns true for defined attributes", () => {
      expect(Person.hasAttributeDefinition("name")).toBe(true);
    });

    it("returns false for undefined attributes", () => {
      expect(Person.hasAttributeDefinition("foo")).toBe(false);
    });
  });

  describe("readonly attributes", () => {
    it("readonly attributes are not updated after create", async () => {
      class Item extends Base {
        static {
          this.attribute("code", "string");
          this.attribute("name", "string");
          this.attrReadonly("code");
          this.adapter = adapter;
        }
      }
      const item = await Item.create({ code: "ABC", name: "Widget" });
      item.writeAttribute("code", "XYZ");
      item.writeAttribute("name", "Updated");
      await item.save();
      const found = await Item.find(item.id);
      // code should remain unchanged because it's readonly
      expect(found.readAttribute("code")).toBe("ABC");
      expect(found.readAttribute("name")).toBe("Updated");
    });
  });
});

// =============================================================================
// CALCULATIONS TESTS
// =============================================================================

describe("Calculations (extended)", () => {
  let adapter: DatabaseAdapter;

  class Product extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("price", "integer");
      this.attribute("quantity", "integer");
      this.attribute("category", "string");
    }
  }

  beforeEach(async () => {
    adapter = freshAdapter();
    Product.adapter = adapter;
    await Product.create({ name: "Apple", price: 1, quantity: 10, category: "fruit" });
    await Product.create({ name: "Banana", price: 2, quantity: 20, category: "fruit" });
    await Product.create({ name: "Carrot", price: 3, quantity: 30, category: "vegetable" });
    await Product.create({ name: "Donut", price: 5, quantity: 5, category: "pastry" });
  });

  describe("count", () => {
    it("counts all records", async () => {
      expect(await Product.count()).toBe(4);
    });

    it("counts with where clause", async () => {
      const count = await Product.all().where({ category: "fruit" }).count();
      expect(count).toBe(2);
    });

    it("returns 0 when no records match", async () => {
      const count = await Product.all().where({ category: "meat" }).count();
      expect(count).toBe(0);
    });
  });

  describe("sum", () => {
    it("sums a column", async () => {
      const total = await Product.all().sum("price");
      expect(total).toBe(11);
    });

    it("sums with where clause", async () => {
      const total = await Product.all().where({ category: "fruit" }).sum("price");
      expect(total).toBe(3);
    });

    it("returns 0 for no records", async () => {
      const total = await Product.all().where({ category: "meat" }).sum("price");
      expect(total).toBe(0);
    });
  });

  describe("minimum", () => {
    it("returns minimum value", async () => {
      const min = await Product.all().minimum("price");
      expect(min).toBe(1);
    });

    it("returns minimum with where clause", async () => {
      const min = await Product.all().where({ category: "fruit" }).minimum("price");
      expect(min).toBe(1);
    });
  });

  describe("maximum", () => {
    it("returns maximum value", async () => {
      const max = await Product.all().maximum("price");
      expect(max).toBe(5);
    });

    it("returns maximum with where clause", async () => {
      const max = await Product.all().where({ category: "fruit" }).maximum("price");
      expect(max).toBe(2);
    });
  });

  describe("average", () => {
    it("returns average value", async () => {
      const avg = await Product.all().average("price");
      expect(avg).toBeCloseTo(2.75, 1);
    });

    it("returns average with where clause", async () => {
      const avg = await Product.all().where({ category: "fruit" }).average("price");
      expect(avg).toBeCloseTo(1.5, 1);
    });
  });

  describe("pluck", () => {
    it("returns values for a single column", async () => {
      const names = await Product.all().pluck("name");
      expect(names).toContain("Apple");
      expect(names).toContain("Banana");
      expect(names).toHaveLength(4);
    });

    it("returns values with where clause", async () => {
      const names = await Product.all().where({ category: "fruit" }).pluck("name");
      expect(names).toHaveLength(2);
    });
  });

  describe("ids", () => {
    it("returns all primary key values", async () => {
      const ids = await Product.all().ids();
      expect(ids).toHaveLength(4);
    });
  });

  describe("exists", () => {
    it("returns true when records exist", async () => {
      expect(await Product.all().exists()).toBe(true);
    });

    it("returns false for empty result set", async () => {
      expect(await Product.all().where({ category: "meat" }).exists()).toBe(false);
    });
  });

  describe("count via class method", async () => {
    it("delegates to relation", async () => {
      expect(await Product.count()).toBe(4);
    });
  });

  describe("sum via class method", () => {
    it("delegates to relation", async () => {
      expect(await Product.sum("price")).toBe(11);
    });
  });

  describe("minimum via class method", () => {
    it("delegates to relation", async () => {
      expect(await Product.minimum("price")).toBe(1);
    });
  });

  describe("maximum via class method", () => {
    it("delegates to relation", async () => {
      expect(await Product.maximum("price")).toBe(5);
    });
  });

  describe("average via class method", () => {
    it("delegates to relation", async () => {
      const avg = await Product.average("price");
      expect(avg).toBeCloseTo(2.75, 1);
    });
  });

  describe("pick", () => {
    it("returns a single value from first record", async () => {
      const val = await Product.all().order("name").pick("name");
      expect(val).toBe("Apple");
    });
  });

  describe("none", () => {
    it("returns empty results", async () => {
      const items = await Product.all().none().toArray();
      expect(items).toHaveLength(0);
    });

    it("count returns 0", async () => {
      expect(await Product.all().none().count()).toBe(0);
    });
  });
});

// =============================================================================
// ENUM TESTS
// =============================================================================

describe("Enum (extended)", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  describe("defineEnum with array form", () => {
    it("creates mapping from array", () => {
      class Post extends Base {
        static {
          this.attribute("status", "integer");
          this.adapter = adapter;
        }
      }
      defineEnum(Post, "status", ["draft", "published", "archived"]);

      const p = new Post({});
      p.writeAttribute("status", 0);
      expect(readEnumValue(p, "status")).toBe("draft");

      p.writeAttribute("status", 1);
      expect(readEnumValue(p, "status")).toBe("published");
    });
  });

  describe("defineEnum with object form", () => {
    it("creates mapping from object", () => {
      class Post extends Base {
        static {
          this.attribute("status", "integer");
          this.adapter = adapter;
        }
      }
      defineEnum(Post, "status", { draft: 0, published: 1, archived: 2 });

      const p = new Post({});
      p.writeAttribute("status", 2);
      expect(readEnumValue(p, "status")).toBe("archived");
    });
  });

  describe("predicate methods", () => {
    it("generates is* predicate methods", () => {
      class Post extends Base {
        static {
          this.attribute("status", "integer");
          this.adapter = adapter;
        }
      }
      defineEnum(Post, "status", ["draft", "published"]);

      const p = new Post({});
      p.writeAttribute("status", 0);
      expect((p as any).isDraft()).toBe(true);
      expect((p as any).isPublished()).toBe(false);
    });
  });

  describe("setter methods", () => {
    it("generates setter methods that update value", () => {
      class Post extends Base {
        static {
          this.attribute("status", "integer");
          this.adapter = adapter;
        }
      }
      defineEnum(Post, "status", ["draft", "published"]);

      const p = new Post({});
      (p as any).published();
      expect(p.readAttribute("status")).toBe(1);
      expect((p as any).isPublished()).toBe(true);
    });
  });

  describe("readEnumValue", () => {
    it("returns null for undefined enum", () => {
      class Post extends Base {
        static {
          this.attribute("status", "integer");
        }
      }
      const p = new Post({});
      expect(readEnumValue(p, "status")).toBeNull();
    });

    it("returns null for null value", () => {
      class Post extends Base {
        static {
          this.attribute("status", "integer");
          this.adapter = adapter;
        }
      }
      defineEnum(Post, "status", ["draft", "published"]);
      const p = new Post({});
      expect(readEnumValue(p, "status")).toBeNull();
    });
  });

  describe("Base.enum", () => {
    it("defines enum with getter returning symbol name", () => {
      class Task extends Base {
        static {
          this.attribute("priority", "integer");
          this.adapter = adapter;
          this.enum("priority", { low: 0, medium: 1, high: 2 });
        }
      }

      const t = new Task({});
      t.writeAttribute("priority", 1);
      expect((t as any).priority).toBe("medium");
    });

    it("setter accepts string name", () => {
      class Task extends Base {
        static {
          this.attribute("priority", "integer");
          this.adapter = adapter;
          this.enum("priority", { low: 0, medium: 1, high: 2 });
        }
      }

      const t = new Task({});
      (t as any).priority = "high";
      expect(t.readAttribute("priority")).toBe(2);
    });

    it("generates predicate methods", () => {
      class Task extends Base {
        static {
          this.attribute("priority", "integer");
          this.adapter = adapter;
          this.enum("priority", { low: 0, medium: 1, high: 2 });
        }
      }

      const t = new Task({});
      t.writeAttribute("priority", 0);
      expect((t as any).isLow()).toBe(true);
      expect((t as any).isMedium()).toBe(false);
    });

    it("generates bang setter methods", () => {
      class Task extends Base {
        static {
          this.attribute("priority", "integer");
          this.adapter = adapter;
          this.enum("priority", { low: 0, medium: 1, high: 2 });
        }
      }

      const t = new Task({});
      (t as any).highBang();
      expect(t.readAttribute("priority")).toBe(2);
    });

    it("provides static mapping accessor", () => {
      class Task extends Base {
        static {
          this.attribute("priority", "integer");
          this.adapter = adapter;
          this.enum("priority", { low: 0, medium: 1, high: 2 });
        }
      }

      expect((Task as any).prioritys).toEqual({ low: 0, medium: 1, high: 2 });
    });

    it("supports prefix option", () => {
      class Task extends Base {
        static {
          this.attribute("status", "integer");
          this.adapter = adapter;
          this.enum("status", { active: 0, archived: 1 }, { prefix: true });
        }
      }

      const t = new Task({});
      t.writeAttribute("status", 0);
      expect((t as any).isStatus_active()).toBe(true);
    });
  });

  describe("scopes from enum", () => {
    it("defines scopes for each enum value", async () => {
      class Task extends Base {
        static {
          this.attribute("priority", "integer");
          this.adapter = adapter;
          this.enum("priority", { low: 0, medium: 1, high: 2 });
        }
      }

      await Task.create({ priority: 0 });
      await Task.create({ priority: 0 });
      await Task.create({ priority: 2 });

      const lowTasks = await Task.all().low().toArray();
      expect(lowTasks).toHaveLength(2);

      const highTasks = await Task.all().high().toArray();
      expect(highTasks).toHaveLength(1);
    });
  });
});

// =============================================================================
// FINDERS (extended)
// =============================================================================

describe("Finders (extended)", () => {
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
    await User.create({ name: "Alice", email: "alice@test.com", age: 30 });
    await User.create({ name: "Bob", email: "bob@test.com", age: 25 });
    await User.create({ name: "Charlie", email: "charlie@test.com", age: 35 });
  });

  describe("find", () => {
    it("finds by single id", async () => {
      const u = await User.find(1);
      expect(u.readAttribute("name")).toBe("Alice");
    });

    it("raises RecordNotFound for missing id", async () => {
      await expect(User.find(999)).rejects.toThrow();
    });

    it("finds multiple by array of ids", async () => {
      const users = await User.find([1, 2]);
      expect(users).toHaveLength(2);
    });

    it("raises RecordNotFound for partially missing ids", async () => {
      await expect(User.find([1, 999])).rejects.toThrow();
    });
  });

  describe("findBy", () => {
    it("finds first matching record", async () => {
      const u = await User.findBy({ name: "Bob" });
      expect(u).not.toBeNull();
      expect(u!.readAttribute("email")).toBe("bob@test.com");
    });

    it("returns null when not found", async () => {
      const u = await User.findBy({ name: "Nobody" });
      expect(u).toBeNull();
    });
  });

  describe("findByBang", () => {
    it("raises when not found", async () => {
      await expect(User.findByBang({ name: "Nobody" })).rejects.toThrow();
    });
  });

  describe("first / last", () => {
    it("first returns the first record", async () => {
      const u = await User.first();
      expect(u).not.toBeNull();
    });

    it("last returns the last record", async () => {
      const u = await User.last();
      expect(u).not.toBeNull();
    });
  });

  describe("count", () => {
    it("returns total count", async () => {
      expect(await User.count()).toBe(3);
    });
  });

  describe("where (class method)", () => {
    it("returns filtered relation", async () => {
      const users = await User.where({ age: 30 }).toArray();
      expect(users).toHaveLength(1);
      expect(users[0].readAttribute("name")).toBe("Alice");
    });
  });

  describe("order / limit / offset (class methods)", () => {
    it("order delegates to relation", async () => {
      const users = await User.order({ age: "asc" }).toArray();
      expect(users[0].readAttribute("name")).toBe("Bob");
    });

    it("limit delegates to relation", async () => {
      const users = await User.limit(1).toArray();
      expect(users).toHaveLength(1);
    });

    it("offset delegates to relation", async () => {
      const users = await User.offset(1).toArray();
      expect(users).toHaveLength(2);
    });
  });

  describe("scope", () => {
    it("defines named scopes", async () => {
      class Item extends Base {
        static {
          this.attribute("active", "boolean");
          this.adapter = adapter;
          this.scope("active", (rel) => rel.where({ active: true }));
        }
      }
      await Item.create({ active: true });
      await Item.create({ active: false });
      await Item.create({ active: true });

      const items = await Item.all().active().toArray();
      expect(items).toHaveLength(2);
    });
  });

  describe("defaultScope", () => {
    it("applies default scope to all queries", async () => {
      class Item extends Base {
        static {
          this.attribute("active", "boolean");
          this.attribute("name", "string");
          this.adapter = adapter;
          this.defaultScope((rel) => rel.where({ active: true }));
        }
      }
      await Item.create({ name: "A", active: true });
      await Item.create({ name: "B", active: false });

      const items = await Item.all().toArray();
      expect(items).toHaveLength(1);
      expect(items[0].readAttribute("name")).toBe("A");
    });
  });

  describe("destroyBy / deleteBy", () => {
    it("destroyBy removes matching records with callbacks", async () => {
      await User.destroyBy({ name: "Alice" });
      expect(await User.count()).toBe(2);
    });

    it("deleteBy removes matching records without callbacks", async () => {
      await User.deleteBy({ name: "Alice" });
      expect(await User.count()).toBe(2);
    });
  });
});
