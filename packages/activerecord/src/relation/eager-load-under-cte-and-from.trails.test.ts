import { it, expect } from "vitest";
import "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { describeIfSupports } from "../support/supports.js";

describeIfSupports("common_table_expressions", "eager load under a CTE / FROM override", () => {
  fixtures(["posts", "comments"]);

  it("emits the aliased eager JOIN alongside the CTE", async () => {
    const relation = Post.with({
      posts_with_comments: Post.where("legacy_comments_count > 0"),
    }).eagerLoad(":comments");

    const sql = relation.toSql();
    expect(sql).toMatch(/WITH\s+/i);
    expect(sql).toMatch(/LEFT OUTER JOIN/i);

    const posts = await relation.order("posts.id");
    expect(posts.length).toBeGreaterThan(0);
  });

  it("emits the aliased eager JOIN alongside a FROM override", async () => {
    const relation = Post.from("posts AS posts").eagerLoad(":comments");

    expect(relation.toSql()).toMatch(/LEFT OUTER JOIN/i);

    const posts = await relation.order("posts.id");
    expect(posts.length).toBeGreaterThan(0);
  });

  it("renders the limited-ids subquery for an eager-loaded limited relation used as FROM", async () => {
    const relation = Post.from(Post.eagerLoad(":comments").limit(2).order("posts.id"), "posts");

    const sql = relation.toSql();
    expect(sql).toMatch(/LEFT OUTER JOIN/i);
    expect(sql).toMatch(/IN \(SELECT DISTINCT/i);

    const posts = await relation;
    expect(posts.length).toBeGreaterThan(0);
  });
});
