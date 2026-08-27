import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { captureSql } from "../testing/sql-capture.js";
import type { Base } from "../index.js";

describe("Post single-PK eager count limit id subquery applies order", () => {
  fixtures([]);

  beforeAll(() => {
    [Post, Comment].forEach((m) => registerModel(m as unknown as typeof Base));
  });

  async function seedPosts(): Promise<void> {
    await Post.create({ id: 1, title: "C", body: "b", tags_count: 5 });
    await Post.create({ id: 2, title: "A", body: "b", tags_count: 7 });
    await Post.create({ id: 3, title: "B", body: "b", tags_count: 7 });
    await Comment.create({ post_id: 2, body: "c1" });
    await Comment.create({ post_id: 2, body: "c2" });
    await Comment.create({ post_id: 1, body: "c3" });
    await Comment.create({ post_id: 3, body: "c4" });
  }

  it("eager_load(:comments).order(:title).limit(n).count(column) counts over the ordered top-n rows", async () => {
    await seedPosts();
    let count = 0;
    const sqls = await captureSql(async () => {
      count = (await Post.eagerLoad(":comments")
        .order("title")
        .limit(2)
        .count("posts.tags_count")) as number;
    });
    expect(count).toBe(1);
    const idSql = sqls.find((s) => /DISTINCT/i.test(s) && /ORDER BY/i.test(s) && /LIMIT/i.test(s));
    expect(idSql).toBeTruthy();
    expect(idSql).toMatch(/ORDER BY.*title/i);
  });

  it("eager_load(:comments).order(:title).offset(n).count(column) counts over the ordered rows after the offset", async () => {
    await seedPosts();
    const count = await Post.eagerLoad(":comments")
      .order("title")
      .offset(1)
      .count("posts.tags_count");
    expect(count).toBe(2);
  });
});
