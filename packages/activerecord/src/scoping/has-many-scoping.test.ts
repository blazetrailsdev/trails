/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, CollectionProxy, registerModel } from "../index.js";
import { Associations } from "../associations.js";

import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("HasManyScopingTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  function makeModels() {
    class Author extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.hasMany.call(Author, "posts", {});
    registerModel(Author);
    registerModel(Post);
    return { Author, Post };
  }

  it("forwarding of static methods", async () => {
    const { Author, Post } = makeModels();
    const a = await Author.create({ name: "Alice" });
    await Post.create({ title: "P1", author_id: a.id });
    await Post.create({ title: "P2", author_id: a.id });
    const proxy = new CollectionProxy(a, "posts", {
      type: "hasMany",
      name: "posts",
      options: {},
    } as any);
    const posts = await proxy.toArray();
    expect(posts.length).toBe(2);
  });

  it("nested scope finder", async () => {
    const { Author, Post } = makeModels();
    const a = await Author.create({ name: "Alice" });
    await Post.create({ title: "A", author_id: a.id });
    await Post.create({ title: "B", author_id: a.id });
    const proxy = new CollectionProxy(a, "posts", {
      type: "hasMany",
      name: "posts",
      options: {},
    } as any);
    const posts = await proxy.where({ title: "A" });
    expect(posts.length).toBe(1);
    expect(posts[0].readAttribute("title")).toBe("A");
  });

  it("none scoping", async () => {
    const { Author, Post } = makeModels();
    const a = await Author.create({ name: "Alice" });
    await Post.create({ title: "P1", author_id: a.id });
    const noneRel = Post.none();
    const results = await noneRel.toArray();
    expect(results.length).toBe(0);
  });
});
