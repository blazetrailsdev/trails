import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { Base, registerModel, delegate } from "./index.js";
import { Associations } from "./associations.js";
import { createTestAdapter } from "./test-adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { dropAllTables } from "./test-helpers/drop-all-tables.js";
import type { DatabaseAdapter } from "./adapter.js";

let adapter: DatabaseAdapter;

beforeAll(() => {
  adapter = createTestAdapter();
});
beforeEach(async () => {
  await defineSchema(adapter, {
    authors: { name: "string", city: "string" },
    posts: { title: "string", author_id: "integer" },
  });
});
afterAll(async () => {
  await dropAllTables(adapter);
});

describe("Delegate (Rails-guided)", () => {
  // Rails: test "delegate to association"
  it("delegates attribute reads to a belongs_to association", async () => {
    class Author extends Base {
      static {
        this._tableName = "authors";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("city", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Author);

    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(Post, "author");
    delegate(Post, ["name", "city"], { to: "author" });

    const author = await Author.create({ name: "DHH", city: "Chicago" });
    const post = await Post.create({ title: "Rails is great", author_id: author.id });

    expect(await (post as any).name()).toBe("DHH");
    expect(await (post as any).city()).toBe("Chicago");
  });

  // Rails: test "delegate with prefix"
  it("delegate with prefix: true prefixes method names", async () => {
    class Author extends Base {
      static {
        this._tableName = "authors";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Author);

    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("author_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(Post, "author");
    delegate(Post, ["name"], { to: "author", prefix: true });

    const author = await Author.create({ name: "DHH" });
    const post = await Post.create({ author_id: author.id });

    expect(await (post as any).authorName()).toBe("DHH");
  });

  // Rails: test "delegate returns null when association is nil"
  it("returns null when the association target is nil", async () => {
    class Author extends Base {
      static {
        this._tableName = "authors";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Author);

    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("author_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(Post, "author");
    delegate(Post, ["name"], { to: "author" });

    const post = await Post.create({ author_id: null });
    expect(await (post as any).name()).toBeNull();
  });
});
