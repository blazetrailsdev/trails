/**
 * `build_where_clause` stringifies every hash key before looking up an
 * attribute alias, taking references, or expanding the hash
 * (query_methods.rb:1632-1641). Ruby gets that for free from `Symbol#to_s`;
 * trails spells a Ruby Symbol as a leading-colon string, so the colon has to be
 * dropped at the same point — `where.associated` / `where.missing` key the
 * `class_name:` branch with the association Symbol (query_methods.rb:96-99,
 * :130-133), and a Symbol key must name the same association a String key does.
 *
 * trails-only (hence `.trails.test.ts`): on the Ruby side the two spellings are
 * different types rather than two strings, so Rails cannot write this test.
 */
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
    // `Post#firstComment` is `class_name: "Comment"` over the `comments` table,
    // so the condition is keyed by the association Symbol
    // (query_methods.rb:96-98), not by `reflection.table_name`.
    const conn = Post.connection;
    const sql = Post.where().associated("firstComment").toSql();
    const qualified = `${conn.quoteTableName("firstComment")}.${conn.quoteColumnName("id")}`;
    expect(sql).toContain(`${qualified} IS NOT NULL`);
    expect(sql).not.toContain(
      `${conn.quoteTableName("comments")}.${conn.quoteColumnName("id")} IS NOT NULL`,
    );
  });
});
