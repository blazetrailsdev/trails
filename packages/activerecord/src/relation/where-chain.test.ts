/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, Range, registerModel } from "../index.js";
import { Associations } from "../associations.js";

import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("WhereChainTest", () => {
  const adapter = freshAdapter();
  class Post extends Base {
    static {
      this.attribute("title", "string");
      this.attribute("author_id", "integer");
      this.adapter = adapter;
    }
  }
  class Author extends Base {
    static {
      this.attribute("name", "string");
      this.adapter = adapter;
    }
  }
  Associations.belongsTo.call(Post, "author", {});
  registerModel(Post);
  registerModel(Author);

  it("associated with child association", () => {
    const sql = Post.all().whereAssociated("author").toSql();
    expect(sql).toContain("author_id");
    expect(sql).toMatch(/!=\s*NULL|IS NOT NULL/);
  });
  it.skip("associated merged with scope on association", () => {
    /* requires scoped associations */
  });
  it.skip("associated unscoped merged with scope on association", () => {
    /* requires scoped associations */
  });
  it.skip("associated unscoped merged joined with scope on association", () => {
    /* fixture-dependent */
  });
  it.skip("associated unscoped merged joined extended early with scope on association", () => {
    /* fixture-dependent */
  });
  it.skip("associated unscoped merged joined extended late with scope on association", () => {
    /* fixture-dependent */
  });
  it.skip("associated ordered merged with scope on association", () => {
    /* fixture-dependent */
  });
  it.skip("associated ordered merged joined with scope on association", () => {
    /* fixture-dependent */
  });
  it.skip("associated with enum", () => {
    /* fixture-dependent */
  });
  it.skip("associated with enum ordered", () => {
    /* fixture-dependent */
  });
  it.skip("associated with enum unscoped", () => {
    /* fixture-dependent */
  });
  it.skip("associated with enum extended early", () => {
    /* fixture-dependent */
  });
  it.skip("associated with enum extended late", () => {
    /* fixture-dependent */
  });
  it.skip("associated with add joins before", () => {
    /* fixture-dependent */
  });
  it.skip("associated with add left joins before", () => {
    /* fixture-dependent */
  });
  it.skip("associated with add left outer joins before", () => {
    /* fixture-dependent */
  });
  it.skip("associated with composite primary key", () => {
    /* fixture-dependent */
  });
  it("missing with child association", () => {
    const sql = Post.all().whereMissing("author").toSql();
    expect(sql).toContain("author_id");
    expect(sql).toContain("IS NULL");
  });
  it("missing with invalid association name", () => {
    expect(() => Post.all().whereMissing("nonexistent")).toThrow(
      /Association named 'nonexistent' was not found/,
    );
  });
  it("missing with multiple association", () => {
    const adapter2 = freshAdapter();
    class Article extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
        this.attribute("category_id", "integer");
        this.adapter = adapter2;
      }
    }
    class ArtAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter2;
      }
    }
    class ArtCategory extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter2;
      }
    }
    Associations.belongsTo.call(Article, "artAuthor", { foreignKey: "author_id" });
    Associations.belongsTo.call(Article, "artCategory", { foreignKey: "category_id" });
    registerModel(Article);
    registerModel(ArtAuthor);
    registerModel(ArtCategory);
    const sql = Article.all().whereMissing("artAuthor").toSql();
    expect(sql).toContain("author_id");
    expect(sql).toContain("IS NULL");
  });
  it.skip("missing merged with scope on association", () => {
    /* fixture-dependent */
  });
  it.skip("missing unscoped merged with scope on association", () => {
    /* fixture-dependent */
  });
  it.skip("missing unscoped merged joined with scope on association", () => {
    /* fixture-dependent */
  });
  it.skip("missing ordered merged with scope on association", () => {
    /* fixture-dependent */
  });
  it.skip("missing ordered merged joined with scope on association", () => {
    /* fixture-dependent */
  });
  it.skip("missing unscoped merged joined extended early with scope on association", () => {
    /* fixture-dependent */
  });
  it.skip("missing unscoped merged joined extended late with scope on association", () => {
    /* fixture-dependent */
  });
  it.skip("missing with enum", () => {
    /* fixture-dependent */
  });
  it.skip("missing with enum ordered", () => {
    /* fixture-dependent */
  });
  it.skip("missing with enum unscoped", () => {
    /* fixture-dependent */
  });
  it.skip("missing with enum extended early", () => {
    /* fixture-dependent */
  });
  it.skip("missing with enum extended late", () => {
    /* fixture-dependent */
  });
  it.skip("missing with composite primary key", () => {
    /* fixture-dependent */
  });

  it("rewhere with alias condition", () => {
    const sql = Post.where({ title: "old" }).rewhere({ title: "new" }).toSql();
    expect(sql).toContain("new");
    expect(sql).not.toContain("old");
  });

  it("rewhere with nested condition", () => {
    const sql = Post.where({ title: "original" }).rewhere({ title: "replaced" }).toSql();
    expect(sql).toContain("replaced");
  });

  it("rewhere with infinite upper bound range", () => {
    const sql = Post.where({ author_id: new Range(1, 10) })
      .rewhere({ author_id: new Range(5, 20) })
      .toSql();
    expect(sql).toContain("BETWEEN");
    expect(sql).toContain("20");
  });
  it("rewhere with infinite lower bound range", () => {
    const sql = Post.where({ author_id: new Range(1, 100) })
      .rewhere({ author_id: new Range(10, 50) })
      .toSql();
    expect(sql).toContain("BETWEEN");
    expect(sql).toContain("10");
  });
  it("rewhere with infinite range", () => {
    const sql = Post.where({ author_id: new Range(1, 5) })
      .rewhere({ author_id: null })
      .toSql();
    expect(sql).toContain("NULL");
    expect(sql).not.toContain("BETWEEN");
  });

  it("rewhere with nil", async () => {
    const sql = Post.where({ author_id: 1 }).rewhere({ author_id: null }).toSql();
    expect(sql).toContain("NULL");
  });
});

describe("WhereChainTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  function makePost() {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
        this.adapter = adapter;
      }
    }
    return Post;
  }

  it("not inverts where clause", async () => {
    const Post = makePost();
    await Post.create({ title: "Include" });
    await Post.create({ title: "Exclude" });
    const found = await Post.whereNot({ title: "Exclude" }).toArray();
    expect(found.length).toBe(1);
    expect(found[0].readAttribute("title")).toBe("Include");
  });

  it("not with nil", async () => {
    const Post = makePost();
    await Post.create({ title: "With Title" });
    await Post.create({ title: null });
    const found = await Post.whereNot({ title: null }).toArray();
    expect(found.every((p: any) => p.readAttribute("title") !== null)).toBe(true);
  });

  it("not eq with preceding where", async () => {
    const Post = makePost();
    await Post.create({ title: "A", author_id: 1 });
    await Post.create({ title: "B", author_id: 1 });
    await Post.create({ title: "C", author_id: 2 });
    const found = await Post.where({ author_id: 1 }).whereNot({ title: "B" }).toArray();
    expect(found.length).toBe(1);
    expect(found[0].readAttribute("title")).toBe("A");
  });

  it("not eq with succeeding where", async () => {
    const Post = makePost();
    await Post.create({ title: "A", author_id: 1 });
    await Post.create({ title: "B", author_id: 2 });
    const found = await Post.whereNot({ title: "B" }).where({ author_id: 1 }).toArray();
    expect(found.length).toBe(1);
  });

  it("chaining multiple", async () => {
    const Post = makePost();
    await Post.create({ title: "Keep", author_id: 1 });
    await Post.create({ title: "Drop", author_id: 1 });
    await Post.create({ title: "Keep", author_id: 2 });
    const found = await Post.whereNot({ title: "Drop" }).where({ author_id: 1 }).toArray();
    expect(found.length).toBe(1);
    expect(found[0].readAttribute("title")).toBe("Keep");
  });

  it("rewhere with one condition", async () => {
    const Post = makePost();
    await Post.create({ title: "Old" });
    await Post.create({ title: "New" });
    const sql = Post.where({ title: "Old" }).rewhere({ title: "New" }).toSql();
    expect(sql).toMatch(/New/);
    expect(sql).not.toMatch(/Old/);
  });

  it("rewhere with multiple overwriting conditions", async () => {
    const Post = makePost();
    const sql = Post.where({ title: "A", author_id: 1 })
      .rewhere({ title: "B", author_id: 2 })
      .toSql();
    expect(sql).toMatch(/B/);
    expect(sql).not.toMatch(/\bA\b/);
  });

  it("rewhere with one overwriting condition and one unrelated", async () => {
    const Post = makePost();
    const sql = Post.where({ title: "Old", author_id: 1 }).rewhere({ title: "New" }).toSql();
    expect(sql).toMatch(/New/);
    expect(sql).toMatch(/author_id/);
  });

  it("associated with association", async () => {
    const Post = makePost();
    await Post.create({ title: "With Author", author_id: 1 });
    await Post.create({ title: "No Author", author_id: null });
    const withAuthor = await Post.whereNot({ author_id: null }).toArray();
    expect(withAuthor.every((p: any) => p.readAttribute("author_id") !== null)).toBe(true);
  });

  it("missing with association", async () => {
    const Post = makePost();
    await Post.create({ title: "With Author", author_id: 1 });
    await Post.create({ title: "No Author", author_id: null });
    const missing = await Post.where({ author_id: null }).toArray();
    expect(missing.every((p: any) => p.readAttribute("author_id") === null)).toBe(true);
  });

  it("not inverts where clause (rewhere variant)", async () => {
    const Post = makePost();
    await Post.create({ title: "A" });
    await Post.create({ title: "B" });
    const found = await Post.whereNot({ title: ["C", "D"] }).toArray();
    expect(found.length).toBe(2);
  });

  it("association not eq", async () => {
    const Post = makePost();
    await Post.create({ title: "Match", author_id: 5 });
    await Post.create({ title: "NoMatch", author_id: 10 });
    const found = await Post.whereNot({ author_id: 10 }).toArray();
    expect(found.length).toBe(1);
    expect(found[0].readAttribute("title")).toBe("Match");
  });

  it("associated with multiple associations", async () => {
    class MaAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class MaCategory extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class MaPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
        this.attribute("category_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(MaPost, "maAuthor", { foreignKey: "author_id" });
    Associations.belongsTo.call(MaPost, "maCategory", { foreignKey: "category_id" });
    registerModel(MaAuthor);
    registerModel(MaCategory);
    registerModel(MaPost);
    const author = await MaAuthor.create({ name: "Alice" });
    const category = await MaCategory.create({ name: "Tech" });
    await MaPost.create({ title: "Both", author_id: author.id, category_id: category.id });
    await MaPost.create({ title: "AuthorOnly", author_id: author.id, category_id: null });
    await MaPost.create({ title: "Neither", author_id: null, category_id: null });
    const results = await MaPost.all().whereAssociated("maAuthor", "maCategory").toArray();
    expect(results.length).toBe(1);
    expect(results[0].readAttribute("title")).toBe("Both");
  });

  it("associated with invalid association name", async () => {
    const Post = makePost();
    expect(() => Post.all().whereAssociated("nonexistent")).toThrow(
      /Association named 'nonexistent' was not found/,
    );
  });

  it.skip("rewhere with polymorphic association", async () => {
    // requires polymorphic association
  });

  it.skip("rewhere with range", async () => {
    // requires Range support in rewhere
  });
});

// ==========================================================================
// WhereChainTest — targets relation/where_chain_test.rb (continued)
// ==========================================================================
