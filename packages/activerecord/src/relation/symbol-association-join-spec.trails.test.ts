/**
 * Rails' `joins(:comments)` passes a Symbol; `JoinDependency.walk_tree` keys the
 * tree by `associations.to_sym` (join_dependency.rb:55-56), so the Symbol and
 * the equivalent String name the same association. trails spells a Ruby Symbol
 * as a leading-colon string, so `joins(":comments")` must resolve the
 * `comments` association exactly as `joins("comments")` does — the colon is
 * modelling, not part of the name.
 *
 * trails-only (hence `.trails.test.ts`): Rails cannot write this test, because
 * on the Ruby side the two spellings are different types rather than two
 * strings.
 */
import { describe, it, expect } from "vitest";
import "../index.js";
import { Post } from "../test-helpers/models/post.js";
import { fixtures } from "../test-fixtures.js";

describe("a leading-colon association spec", () => {
  fixtures(["posts", "comments"]);

  it("joins the same association as the bare string", async () => {
    expect(Post.joins(":comments").toSql()).toBe(Post.joins("comments").toSql());
    expect(await Post.joins(":comments").count()).toBe(await Post.joins("comments").count());
  });

  it("left outer joins the same association as the bare string", async () => {
    expect(Post.leftOuterJoins(":comments").toSql()).toBe(Post.leftOuterJoins("comments").toSql());
    expect(await Post.leftOuterJoins(":comments").count()).toBe(
      await Post.leftOuterJoins("comments").count(),
    );
  });

  it("joins a nested spec given as a colon string", () => {
    expect(Post.joins({ comments: ":post" }).toSql()).toBe(
      Post.joins({ comments: "post" }).toSql(),
    );
  });

  it("joins a nested spec whose key is a colon string", async () => {
    // Rails `joins(comments: :post)` — both halves of the hash are Symbols.
    expect(Post.joins({ ":comments": ":post" }).toSql()).toBe(
      Post.joins({ comments: "post" }).toSql(),
    );
    expect(await Post.joins({ ":comments": ":post" }).count()).toBe(
      await Post.joins({ comments: "post" }).count(),
    );
  });
});
