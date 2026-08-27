import { describe, it, expect } from "vitest";
import "../index.js";
import { Post } from "../test-helpers/models/post.js";
import { fixtures } from "../test-fixtures.js";

describe("a leading-colon where key", () => {
  fixtures(["posts", "comments"]);

  it("resolves the association the bare string resolves", () => {
    expect(
      Post.joins(":comments")
        .where({ ":comments": { id: null } })
        .toSql(),
    ).toBe(
      Post.joins(":comments")
        .where({ comments: { id: null } })
        .toSql(),
    );
  });

  it("keys where.associated off a class_name association whose name is not its table", () => {
    const conn = Post.connection;
    const sql = Post.where().associated("firstComment").toSql();
    const qualified = `${conn.quoteTableName("firstComment")}.${conn.quoteColumnName("id")}`;
    expect(sql).toContain(`${qualified} IS NOT NULL`);
    expect(sql).not.toContain(
      `${conn.quoteTableName("comments")}.${conn.quoteColumnName("id")} IS NOT NULL`,
    );
  });
});
