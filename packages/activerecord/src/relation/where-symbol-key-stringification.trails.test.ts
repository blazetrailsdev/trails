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

  it("resolves the column and the CTE name the bare string resolves", () => {
    expect(Post.where({ ":title": "x" }).toSql()).toBe(Post.where({ title: "x" }).toSql());
    expect(Post.with({ ":recent": Post.all() }).toSql()).toBe(
      Post.with({ recent: Post.all() }).toSql(),
    );
  });

  it("names the Ruby class of an unsupported where argument", () => {
    expect(() => Post.where(5 as never)).toThrow("Unsupported argument type: 5 (Integer)");
  });

  it("keys where.associated off a class_name association whose name is not its table", async () => {
    const conn = await Post.leaseConnection();
    const sql = Post.where().associated(":firstComment").toSql();
    const qualified = `${conn.quoteTableName("firstComment")}.${conn.quoteColumnName("id")}`;
    expect(sql).toContain(`${qualified} IS NOT NULL`);
    expect(sql).not.toContain(
      `${conn.quoteTableName("comments")}.${conn.quoteColumnName("id")} IS NOT NULL`,
    );
  });
});
