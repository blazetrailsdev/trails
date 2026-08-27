import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
import "../support/canonical-model-index.js";
import { Post } from "../test-helpers/models/post.js";

describe("eager build_joins shared AliasTracker", () => {
  fixtures([]);

  it("aliases the eager OUTER JOIN when an explicit joins already claims the table", () => {
    const rel = Post.includes(":author")
      .references(":author")
      .joins("INNER JOIN authors ON authors.id = posts.author_id");
    const sql = (rel as unknown as { toSql(): string }).toSql().replace(/["`]/g, "");

    expect(sql).toContain("LEFT OUTER JOIN authors authors_posts");
    expect(sql).toContain("authors_posts.id AS t1_r0");
    expect(sql).toContain("INNER JOIN authors ON authors.id = posts.author_id");
  });
});
