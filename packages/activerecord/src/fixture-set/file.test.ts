import { describe, it, expect, beforeEach } from "vitest";
import { FixtureSet, identify } from "./file.js";
import { ReflectionProxy } from "./table-row.js";
import { createTestAdapter } from "../test-adapter.js";
import { MigrationContext } from "../migration.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("FixtureSet", () => {
  describe("FileTest", () => {
    it.skip("open", () => {});
    it.skip("open with block", () => {});
    it.skip("names", () => {});
    it.skip("erb processing", () => {});
    it.skip("empty file", () => {});
    it.skip("wrong fixture format string", () => {});
    it.skip("wrong fixture format nested", () => {});
    it.skip("wrong config row", () => {});
    it.skip("render context helper", () => {});
    it.skip("render context lookup scope", () => {});
    it.skip("independent render contexts", () => {});
    it.skip("removes fixture config row", () => {});
    it.skip("extracts model class from config row", () => {});
  });

  describe("identify", () => {
    it("generates deterministic IDs from labels", () => {
      const id1 = identify("alice");
      const id2 = identify("alice");
      expect(id1).toBe(id2);
      expect(typeof id1).toBe("number");
      expect(id1).toBeGreaterThanOrEqual(0);
    });

    it("generates different IDs for different labels", () => {
      expect(identify("alice")).not.toBe(identify("bob"));
    });
  });

  describe("FixtureSet core", () => {
    it("loads fixtures from data", () => {
      const fs = new FixtureSet("users", {
        alice: { name: "Alice", email: "alice@example.com" },
        bob: { name: "Bob", email: "bob@example.com" },
      });
      expect(fs.size).toBe(2);
      expect(fs.get("alice")).toEqual({ name: "Alice", email: "alice@example.com" });
    });

    it("merges DEFAULTS into each fixture", () => {
      const fs = new FixtureSet("users", {
        DEFAULTS: { role: "user" },
        alice: { name: "Alice" },
        bob: { name: "Bob" },
      });
      expect(fs.get("alice")).toEqual({ role: "user", name: "Alice" });
      expect(fs.get("bob")).toEqual({ role: "user", name: "Bob" });
      expect(fs.size).toBe(2);
    });

    it("fixture values override DEFAULTS", () => {
      const fs = new FixtureSet("users", {
        DEFAULTS: { role: "user" },
        admin: { name: "Admin", role: "admin" },
      });
      expect(fs.get("admin")!.role).toBe("admin");
    });

    it("toRows assigns deterministic IDs", () => {
      const fs = new FixtureSet("users", {
        alice: { name: "Alice" },
      });
      const rows = fs.toRows();
      expect(rows[0].id).toBe(identify("alice"));
      expect(rows[0].name).toBe("Alice");
    });

    it("toRows preserves explicit IDs", () => {
      const fs = new FixtureSet("users", {
        alice: { id: 42, name: "Alice" },
      });
      const rows = fs.toRows();
      expect(rows[0].id).toBe(42);
    });
  });

  describe("insertAll", () => {
    let adapter: DatabaseAdapter;
    let ctx: MigrationContext;

    beforeEach(() => {
      adapter = createTestAdapter();
      ctx = new MigrationContext(adapter);
    });

    it("inserts fixture rows into the database", async () => {
      await ctx.createTable("users", {}, (t) => {
        t.string("name");
        t.string("email");
      });

      const fs = new FixtureSet("users", {
        alice: { name: "Alice", email: "alice@example.com" },
        bob: { name: "Bob", email: "bob@example.com" },
      });

      await fs.insertAll(adapter);
      const rows = await adapter.execute('SELECT "name" FROM "users" ORDER BY "name"');
      expect(rows.map((r) => r.name)).toEqual(["Alice", "Bob"]);
    });

    it("loadInto clears table then inserts", async () => {
      await ctx.createTable("posts", {}, (t) => {
        t.string("title");
      });

      await adapter.executeMutation('INSERT INTO "posts" ("id", "title") VALUES (1, \'Old\')');

      const fs = new FixtureSet("posts", {
        new_post: { title: "New" },
      });

      await fs.loadInto(adapter);
      const rows = await adapter.execute('SELECT "title" FROM "posts"');
      expect(rows.length).toBe(1);
      expect(rows[0].title).toBe("New");
    });
  });

  describe("association resolution", () => {
    it("resolves belongs_to labels to foreign key IDs", () => {
      const associations = [new ReflectionProxy("author", "author_id", "Author")];
      const fs = new FixtureSet("posts", {
        first_post: { title: "Hello", author: "alice" },
      });
      const rows = fs.toRows({ associations });
      expect(rows[0].author_id).toBe(identify("alice"));
      expect(rows[0].author).toBeUndefined();
      expect(rows[0].title).toBe("Hello");
    });

    it("does not overwrite explicit foreign key but removes label", () => {
      const associations = [new ReflectionProxy("author", "author_id", "Author")];
      const fs = new FixtureSet("posts", {
        first_post: { title: "Hello", author: "alice", author_id: 99 },
      });
      const rows = fs.toRows({ associations });
      expect(rows[0].author_id).toBe(99);
      expect(rows[0].author).toBeUndefined();
    });

    it("resolves multiple associations", () => {
      const associations = [
        new ReflectionProxy("author", "author_id", "Author"),
        new ReflectionProxy("category", "category_id", "Category"),
      ];
      const fs = new FixtureSet("posts", {
        first_post: { title: "Hello", author: "alice", category: "tech" },
      });
      const rows = fs.toRows({ associations });
      expect(rows[0].author_id).toBe(identify("alice"));
      expect(rows[0].category_id).toBe(identify("tech"));
      expect(rows[0].author).toBeUndefined();
      expect(rows[0].category).toBeUndefined();
    });

    it("insertAll with associations resolves labels to IDs", async () => {
      const adapter = createTestAdapter();
      const ctx = new MigrationContext(adapter);

      await ctx.createTable("authors", {}, (t) => {
        t.string("name");
      });
      await ctx.createTable("posts", {}, (t) => {
        t.string("title");
        t.integer("author_id");
      });

      const authors = new FixtureSet("authors", {
        alice: { name: "Alice" },
      });
      await authors.insertAll(adapter);

      const posts = new FixtureSet("posts", {
        first_post: { title: "Hello", author: "alice" },
      });
      const associations = [new ReflectionProxy("author", "author_id", "Author")];
      await posts.insertAll(adapter, { associations });

      const postRows = await adapter.execute('SELECT "title", "author_id" FROM "posts"');
      expect(postRows[0].author_id).toBe(identify("alice"));

      const authorRows = await adapter.execute('SELECT "id" FROM "authors"');
      expect(authorRows[0].id).toBe(identify("alice"));
    });
  });
});
