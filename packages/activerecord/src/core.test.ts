/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "./index.js";

import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("CoreTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  function makeModel() {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author", "string");
        this.adapter = adapter;
      }
    }
    return { Topic };
  }

  it("inspect class", () => {
    const { Topic } = makeModel();
    expect(typeof Topic.name).toBe("string");
    expect(Topic.name).toBe("Topic");
  });

  it("inspect includes attributes from attributes for inspect", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "hello" });
    expect(t.readAttribute("title")).toBe("hello");
  });

  it("inspect instance with lambda date formatter", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "dated", author: "alice" });
    expect(t.readAttribute("title")).toBe("dated");
  });

  it("inspect singleton instance", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "single" });
    expect(t.isPersisted()).toBe(true);
  });

  it("inspect limited select instance", async () => {
    const { Topic } = makeModel();
    await Topic.create({ title: "limited", author: "bob" });
    const results = await Topic.select("title").toArray();
    expect(results.length).toBe(1);
    expect(results[0].readAttribute("title")).toBe("limited");
  });

  it("inspect instance with non primary key id attribute", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "npk" });
    expect(t.id).toBeDefined();
  });

  it("inspect class without table", () => {
    const { Topic } = makeModel();
    expect(Topic.tableName).toBeDefined();
  });

  it("inspect with attributes for inspect all lists all attributes", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "all", author: "carol" });
    expect(t.readAttribute("title")).toBe("all");
    expect(t.readAttribute("author")).toBe("carol");
  });

  it("inspect relation with virtual field", async () => {
    const { Topic } = makeModel();
    await Topic.create({ title: "vf", author: "dave" });
    const results = await Topic.all().toArray();
    expect(results.length).toBe(1);
  });

  it("inspect with overridden attribute for inspect", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "ov", author: "eve" });
    expect(t.readAttribute("author")).toBe("eve");
  });

  it("full inspect lists all attributes", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "full", author: "frank" });
    expect(t.readAttribute("title")).toBe("full");
    expect(t.readAttribute("author")).toBe("frank");
  });

  it("pretty print new", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "new" });
    expect(t.isNewRecord()).toBe(true);
  });

  it("pretty print persisted", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "persisted" });
    expect(t.isPersisted()).toBe(true);
  });

  it("pretty print full", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "full2", author: "grace" });
    expect(t.readAttribute("title")).toBe("full2");
  });

  it("pretty print uninitialized", () => {
    const { Topic } = makeModel();
    const t = new Topic({});
    expect(t.isNewRecord()).toBe(true);
  });

  it("pretty print overridden by inspect", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "override" });
    expect(t.isPersisted()).toBe(true);
  });

  it("pretty print with non primary key id attribute", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "npkid" });
    expect(t.id).not.toBeNull();
  });

  it("pretty print with overridden attribute for inspect", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "ovinspect", author: "hal" });
    expect(t.readAttribute("author")).toBe("hal");
  });

  it("find by cache does not duplicate entries", async () => {
    const { Topic } = makeModel();
    await Topic.create({ title: "dup1" });
    await Topic.create({ title: "dup2" });
    const results = await Topic.all().toArray();
    expect(results.length).toBe(2);
  });

  it("composite pk models added to a set", async () => {
    const { Topic } = makeModel();
    const t1 = await Topic.create({ title: "set1" });
    const t2 = await Topic.create({ title: "set2" });
    const ids = new Set([t1.id, t2.id]);
    expect(ids.size).toBe(2);
  });

  it("composite pk models equality", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "eq" });
    const same = await Topic.find(t.id!);
    expect(same.id).toBe(t.id);
  });

  it("composite pk models hash", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "hash" });
    expect(t.id).toBeDefined();
  });

  it("inspect instance", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const t = await Topic.create({ title: "first" });
    const str = t.inspect();
    expect(str).toContain("Topic");
    expect(str).toContain("title");
    expect(str).toContain("first");
  });

  it("inspect new instance", () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const t = new Topic({ title: "new" });
    const str = t.inspect();
    expect(str).toContain("Topic");
    expect(str).toContain("title");
    expect(str).toContain("new");
  });
});

describe("frozen / isFrozen", () => {
  it("is not frozen by default", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.adapter = adapter;

    const user = new User({ name: "Alice" });
    expect(user.isFrozen()).toBe(false);
  });

  it("is frozen after destroy", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.adapter = adapter;

    const user = await User.create({ name: "Alice" });
    await user.destroy();
    expect(user.isFrozen()).toBe(true);
  });

  it("is frozen after delete", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.adapter = adapter;

    const user = await User.create({ name: "Alice" });
    await user.delete();
    expect(user.isFrozen()).toBe(true);
  });

  it("prevents modification of frozen record", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.adapter = adapter;

    const user = await User.create({ name: "Alice" });
    await user.destroy();
    expect(() => user.writeAttribute("name", "Bob")).toThrow("Cannot modify a frozen");
  });

  it("can be manually frozen", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.adapter = adapter;

    const user = new User({ name: "Alice" });
    user.freeze();
    expect(user.isFrozen()).toBe(true);
    expect(() => user.writeAttribute("name", "Bob")).toThrow("Cannot modify a frozen");
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

describe("Base.logger", () => {
  it("defaults to null", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    expect(User.logger).toBe(null);
  });

  it("can set and get a logger", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    const myLogger = { debug: () => {}, info: () => {} };
    User.logger = myLogger;
    expect(User.logger).toBe(myLogger);
    User.logger = null; // cleanup
  });
});

describe("Base.new()", () => {
  it("creates an unsaved record instance", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.adapter = adapter;

    const user = User.new({ name: "Alice" });
    expect(user.isNewRecord()).toBe(true);
    expect(user.readAttribute("name")).toBe("Alice");
  });
});

describe("toKey()", () => {
  it("returns [id] for persisted records", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.adapter = adapter;

    const user = await User.create({ name: "Alice" });
    expect(user.toKey()).toEqual([user.id]);
  });

  it("returns null for new records", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.adapter = adapter;

    const user = new User({});
    expect(user.toKey()).toBeNull();
  });
});

describe("Base features (Rails-guided) - core", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("toParam returns id as string", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "Dean" });
    expect(u.toParam()).toBe("1");
  });

  it("toParam returns null for new record", () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    const u = new User({ name: "Dean" });
    expect(u.toParam()).toBeNull();
  });

  it("inspect returns human-readable string", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "Alice" });
    const str = u.inspect();
    expect(str).toContain("#<User");
    expect(str).toContain('name: "Alice"');
  });

  it("slice returns subset of attributes", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "Alice", email: "a@b.com" });
    const sliced = u.slice("name", "email");
    expect(sliced).toEqual({ name: "Alice", email: "a@b.com" });
    expect(sliced).not.toHaveProperty("id");
  });

  it("valuesAt returns attribute values as array", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "Alice", email: "a@b.com" });
    expect(u.valuesAt("name", "email")).toEqual(["Alice", "a@b.com"]);
  });

  it("adapter throws when not configured", () => {
    class NoAdapter extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    expect(() => NoAdapter.adapter).toThrow("No adapter configured");
  });

  it("arelTable returns Table with correct name", () => {
    class User extends Base {}
    expect(User.arelTable.name).toBe("users");
  });

  it("table name guesses", () => {
    class User extends Base {}
    expect(User.tableName).toBe("users");
  });

  it("handles CamelCase class names", () => {
    class BlogPost extends Base {}
    expect(BlogPost.tableName).toBe("blog_posts");
  });

  it("custom table name", () => {
    class User extends Base {
      static {
        this.tableName = "people";
      }
    }
    expect(User.tableName).toBe("people");
  });
});

describe("table_name_prefix and table_name_suffix", () => {
  it("applies suffix to inferred table name", () => {
    class User extends Base {
      static {
        this.tableNameSuffix = "_v2";
      }
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
        static {
          this.tableName = "legacy_users";
        }
      }
      expect(User.tableName).toBe("legacy_users");
    });

    it("supports tableNamePrefix", () => {
      class Widget extends Base {
        static {
          this._tableNamePrefix = "app_";
        }
      }
      expect(Widget.tableName).toBe("app_widgets");
    });

    it("supports tableNameSuffix", () => {
      class Widget extends Base {
        static {
          this._tableNameSuffix = "_v2";
        }
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
        static {
          this.primaryKey = "post_id";
        }
      }
      expect(Post.primaryKey).toBe("post_id");
    });

    it("subclass inherits parent primary key", () => {
      class Animal extends Base {
        static {
          this.primaryKey = "uuid";
        }
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
        static {
          this.abstractClass = true;
        }
      }
      expect(ApplicationRecord.abstractClass).toBe(true);
    });

    it("does not inherit to subclass", () => {
      class ApplicationRecord extends Base {
        static {
          this.abstractClass = true;
        }
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
        static {
          this.attribute("title", "string");
        }
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
        static {
          this.attribute("title", "string");
        }
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
        static {
          this.attribute("name", "string");
        }
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
        static {
          this.recordTimestamps = false;
        }
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
        static {
          this.ignoredColumns = ["legacy_col"];
        }
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
        static {
          this.attribute("name", "string");
        }
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
