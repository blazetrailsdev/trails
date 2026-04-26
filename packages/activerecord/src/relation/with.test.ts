/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect } from "vitest";
import { Base } from "../index.js";

import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// ==========================================================================
// WithTest — targets relation/with_test.rb
// ==========================================================================
describe("WithTest", () => {
  it("with when hash is passed as an argument", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "test1", id: 1 });
    await Post.create({ title: "test2", id: 2 });
    const cteRel = Post.where({});
    const rel = Post.all().with({ recent_posts: cteRel });
    const sql = rel.toSql();
    expect(sql).toContain("WITH");
    expect(sql).toContain("recent_posts");
  });

  it("with when hash with multiple elements of different type is passed as an argument", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "test1", id: 1 });
    const cte1 = Post.where({ id: 1 });
    const cte2 = Post.where({ id: 2 });
    const rel = Post.all().with({ cte1, cte2 });
    const sql = rel.toSql();
    expect(sql).toContain("WITH");
    expect(sql).toContain("cte1");
    expect(sql).toContain("cte2");
  });

  it("with when invalid argument is passed", () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(() => {
      (Post.all() as any).with(Post.where({}));
    }).toThrow();
  });

  it("multiple with calls", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const cte1 = Post.where({});
    const cte2 = Post.where({});
    const rel = Post.all().with({ cte1 }).with({ cte2 });
    const sql = rel.toSql();
    expect(sql).toContain("WITH");
    expect(sql).toContain("cte1");
    expect(sql).toContain("cte2");
  });

  it("multiple dupicate with calls", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const cte = Post.where({});
    const rel = Post.all().with({ dup_cte: cte }).with({ dup_cte: cte });
    const sql = rel.toSql();
    // Duplicate CTE name is deduplicated (last-write-wins) — appears exactly once
    // in the WITH clause, producing valid SQL.
    const matches = (sql.match(/"dup_cte"/g) || []).length;
    expect(matches).toBe(1);
    expect(sql).toContain("WITH");
    // Confirm the generated SQL is valid and executes
    await expect(rel.count()).resolves.toBe(1);
  });

  it("count after with call", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const cte = Post.where({});
    const count = await Post.all().with({ cte }).count();
    expect(count).toBe(2);
  });

  it("with when called from active record scope", async () => {
    const adapter = freshAdapter();
    class WsPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("tags_count", "integer");
        this.adapter = adapter;
      }
      static withTagsCte() {
        return WsPost.all()
          .with({ ws_tagged: WsPost.where("tags_count > 0") })
          .from("ws_tagged AS ws_posts");
      }
    }
    const p1 = await WsPost.create({ title: "tagged", tags_count: 2 });
    const p2 = await WsPost.create({ title: "tagged2", tags_count: 1 });
    await WsPost.create({ title: "untagged", tags_count: 0 });
    const records = await WsPost.withTagsCte().order("id").toArray();
    expect(records.map((r) => (r as any).id).sort()).toEqual([p1.id, p2.id].sort());
  });

  it("with when invalid params are passed", () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(() => {
      Post.all().with({ invalid_cte: null as any });
    }).toThrow();
  });

  it("with when passing arrays", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p1 = await Post.create({ title: "alpha" });
    const p2 = await Post.create({ title: "beta" });
    // Array of relations → UNION CTE
    const rel = Post.all().with({
      union_cte: [Post.where({ id: p1.id }), Post.where({ id: p2.id })],
    });
    const sql = rel.toSql();
    expect(sql).toContain("WITH");
    expect(sql).toContain("UNION");
    expect(sql).toContain("union_cte");
  });

  it("with when passing single item array", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.create({ title: "solo" });
    const rel = Post.all().with({ solo_cte: [Post.where({ id: p.id })] });
    const sql = rel.toSql();
    expect(sql).toContain("WITH");
    expect(sql).toContain("solo_cte");
  });

  it("with recursive", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const cte = Post.where({});
    const sql = Post.all().withRecursive({ recursive_cte: cte }).toSql();
    expect(sql).toContain("WITH RECURSIVE");
    expect(sql).toContain("recursive_cte");
  });

  it("with joins", async () => {
    const adapter = freshAdapter();
    class WjComment extends Base {
      static {
        this.attribute("wj_post_id", "integer");
        this.adapter = adapter;
      }
    }
    class WjPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p1 = await WjPost.create({ title: "with comment" });
    await WjPost.create({ title: "no comment" });
    await WjComment.create({ wj_post_id: p1.id });
    // CTE of distinct wj_post_ids that have comments, joined back to wj_posts
    const commentedPosts = WjComment.select("wj_post_id").distinct();
    const posts = await WjPost.all()
      .with({ commented_wj_posts: commentedPosts })
      .joins(`INNER JOIN commented_wj_posts ON commented_wj_posts.wj_post_id = wj_posts.id`)
      .order("id")
      .toArray();
    expect(posts.map((p) => (p as any).id)).toEqual([p1.id]);
  });

  it("with left joins", async () => {
    const adapter = freshAdapter();
    class WljComment extends Base {
      static {
        this.attribute("wlj_post_id", "integer");
        this.adapter = adapter;
      }
    }
    class WljPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p1 = await WljPost.create({ title: "with comment" });
    await WljPost.create({ title: "no comment" });
    await WljComment.create({ wlj_post_id: p1.id });
    const commentedPosts = WljComment.select("wlj_post_id").distinct();
    const records = await WljPost.all()
      .with({ commented_wlj_posts: commentedPosts })
      .joins(
        `LEFT OUTER JOIN commented_wlj_posts ON commented_wlj_posts.wlj_post_id = wlj_posts.id`,
      )
      .order("wlj_posts.id")
      .toArray();
    // Left join returns all posts including those without comments
    expect(records.length).toBe(2);
  });

  it.skip("raises when using block", () => {
    // Rails tests that passing a block to with() raises ArgumentError.
    // TypeScript has no block/proc syntax; this constraint is not applicable.
  });

  it("unscoping", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const withCte = Post.where({});
    const relation = Post.all().with({ posts_with_cte: withCte });
    expect(relation.toSql()).toContain("WITH");
    const unscoped = relation.unscope("with");
    expect(unscoped.toSql()).not.toContain("WITH");
    expect(await unscoped.count()).toBe(2);
  });

  it.skip("common table expressions are unsupported", () => {
    // The in-memory test adapter (SQLite) supports CTEs. This branch only
    // runs on adapters that don't, which aren't exercised in the test suite.
  });
});
