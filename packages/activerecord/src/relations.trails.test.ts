import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "./index.js";
import { fixtures } from "./test-helpers/use-fixtures.js";
import { Post } from "./test-helpers/models/post.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Comment } from "./test-helpers/models/comment.js";

describe("RelationTest", () => {
  fixtures(["posts"]);

  beforeAll(() => {
    registerModel(Post);
    registerModel(Comment);
  });

  it("eager from() subquery projects the table star, not column aliases", () => {
    const relation = Comment.includes(":post").where({ "posts.type": "Post" }).order(":id");
    const sql = Comment.select("*").from(relation).toSql();
    const unquoted = sql.replace(/["`]/g, "");
    expect(unquoted).toContain("comments.* FROM comments LEFT OUTER JOIN posts");
    expect(unquoted).not.toMatch(/t0_r0/);
  });

  it("order and reorder flatten and compact blank nested arguments", () => {
    expect(() => Topic.order([null] as never)).not.toThrow();
    expect(() => Topic.reorder([{}] as never)).not.toThrow();
    expect(
      Topic.order("title")
        .order([null] as never)
        .toSql(),
    ).toContain("ORDER BY");
    expect(
      Topic.order("title")
        .reorder([{}] as never)
        .toSql(),
    ).not.toContain("ORDER BY");
  });

  it("blank join arguments are not retained in relation state", () => {
    expect(Topic.joins({}).joinsValues).toEqual([]);
    expect(Topic.leftJoins({}).leftOuterJoinsValues).toEqual([]);
    expect(Topic.leftJoins([]).leftOuterJoinsValues).toEqual([]);
  });

  it("except with unrecognized key is a no-op", async () => {
    const relation = Post.where({ author_id: 1 }).order("id ASC").limit(1);
    const baseline = (await relation).map((p) => p.id);

    const unchanged = relation.except("bogus");
    expect((await unchanged).map((p) => p.id)).toEqual(baseline);
  });

  it("only does not replay unscope on merge", () => {
    const stripped = Post.where({ author_id: 1 }).order("id ASC").limit(1).only("where");

    const merged = Post.order("title").limit(5).merge(stripped);
    expect(merged.toSql()).toContain("ORDER BY");
    expect(merged.toSql()).toContain("LIMIT");

    expect(Post.all().distinct().only("distinct").toSql()).toContain("DISTINCT");
    expect(Post.all().distinct().only("where").toSql()).not.toContain("DISTINCT");
  });
});
