import { describe, it, expect } from "vitest";

import { Post } from "../test-helpers/models/post.js";
import { fixtures } from "../test-fixtures.js";

describe("Relation limited ids subquery sanitizers", () => {
  fixtures(["posts", "comments"]);

  it("raises for a non-numeric limit, as the plain build_arel path does", async () => {
    await expect(
      (async () => Post.eagerLoad(":comments").limit("asdfadf").toSql())(),
    ).rejects.toThrow(/invalid value for Integer/);
  });

  it("truncates a string offset through to_i", async () => {
    const eager = await Post.eagerLoad(":comments").order("posts.id").limit(2).offset("1").toSql();
    const plain = await Post.eagerLoad(":comments").order("posts.id").limit(2).offset(1).toSql();
    expect(eager).toBe(plain);
  });
});
