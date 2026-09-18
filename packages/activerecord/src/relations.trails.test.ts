import { describe, it, expect } from "vitest";
import { fixtures } from "./test-fixtures.js";
import { Post } from "./test-helpers/models/post.js";

describe("RelationTest", () => {
  fixtures(["posts"]);

  it("find_by! doesn't have implicit ordering", () => {
    const sql = Post.all().where({ author_id: 2 }).toSql();
    expect(sql).not.toMatch(/ORDER/i);
  });
});
