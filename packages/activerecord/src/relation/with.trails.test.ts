import { it, expect } from "vitest";
import "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
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
});
