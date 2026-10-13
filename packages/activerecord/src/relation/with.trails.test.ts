import { it, expect } from "vitest";
import "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { describeIfSupports } from "../support/supports.js";

describeIfSupports("common_table_expressions", "WithTest (trails)", () => {
  fixtures(["posts"]);

  it("with keeps both entries when the same name is given two different relations", () => {
    const relation = Post.with({ a: Post.where("tags_count > 0") }).with({
      a: Post.where("legacy_comments_count > 0"),
    });

    expect((relation.values()["with"] as unknown[]).length).toBe(2);
  });

  it("with dedups a repeated entry the way Array#| does", () => {
    const cte = Post.where("tags_count > 0");
    const relation = Post.with({ a: cte }).with({ a: cte });

    expect((relation.values()["with"] as unknown[]).length).toBe(1);
  });

  it("with when an empty array is passed reduces to a nil relation", async () => {
    await expect(Post.with({ empty_cte: [] }).load()).rejects.toThrow();
  });

  it("count after with call with bound conditions", async () => {
    const relation = Post.with({ typed_posts: Post.where({ type: "Post" }) })
      .from("typed_posts AS posts")
      .where({ type: "Post" });

    expect(await relation.count()).toEqual(await Post.where({ type: "Post" }).count());
  });

  it("with joins routes a cte symbol to an inner join", () => {
    const sql = (
      Post.with({
        commented_posts: Comment.select("post_id").distinct(),
      }).joins(":commented_posts") as unknown as { toSql(): string }
    ).toSql();

    const q = `["\`]?`;
    expect(sql).toMatch(
      new RegExp(
        `INNER JOIN ${q}commented_posts${q} ON ${q}commented_posts${q}\\.${q}post_id${q} = ${q}posts${q}\\.${q}id${q}`,
      ),
    );
    expect(sql).not.toMatch(new RegExp(`LEFT OUTER JOIN ${q}commented_posts${q}`));
  });

  it("with left joins routes a cte symbol to a left outer join", () => {
    const relation = Post.with({
      commented_posts: Comment.select("post_id").distinct(),
    })
      .leftOuterJoins(":commented_posts")
      .select("posts.id");

    const sql = (relation as unknown as { toSql(): string }).toSql();

    const q = `["\`]?`;
    expect(sql).toMatch(
      new RegExp(
        `LEFT OUTER JOIN ${q}commented_posts${q} ON ${q}commented_posts${q}\\.${q}post_id${q} = ${q}posts${q}\\.${q}id${q}`,
      ),
    );
    expect(sql).not.toMatch(new RegExp(`INNER JOIN ${q}commented_posts${q}`));
  });

  it("with left joins routes a cte symbol before a raw joins node", () => {
    const relation = Post.with({
      commented_posts: Comment.select("post_id").distinct(),
    })
      .joins("INNER JOIN authors ON authors.id = posts.author_id")
      .leftOuterJoins(":commented_posts")
      .select("posts.id");

    const sql = (relation as unknown as { toSql(): string }).toSql();

    const q = `["\`]?`;
    const cteJoin = sql.search(new RegExp(`LEFT OUTER JOIN ${q}commented_posts${q}`));
    const rawJoin = sql.search(/INNER JOIN authors/);
    expect(cteJoin).toBeGreaterThanOrEqual(0);
    expect(rawJoin).toBeGreaterThanOrEqual(0);
    expect(cteJoin).toBeLessThan(rawJoin);
  });
});
