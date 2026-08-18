/**
 * Rails' `references(:posts)` stores the Symbol unconverted (`references!`,
 * query_methods.rb:360-363) and `references_eager_loaded_tables?` reads it back
 * with `references_values.map(&:to_s)` (relation.rb:1488) before subtracting the
 * downcased joined-table list. trails spells a Ruby Symbol as a leading-colon
 * string, so `references(":posts")` must promote `includes` exactly as
 * `references("posts")` does — the colon is modelling, not part of the name.
 *
 * trails-only (hence `.trails.test.ts`): on the Ruby side the two spellings are
 * different types rather than two strings, so Rails cannot write this test.
 */
import { describe, it, expect } from "vitest";
import "../index.js";
import { Post } from "../test-helpers/models/post.js";
import { fixtures } from "../test-fixtures.js";

describe("a leading-colon references value", () => {
  fixtures(["posts", "comments"]);

  it("is subtracted from the joined tables like the bare string", () => {
    expect(Post.includes("comments").references(":posts").toSql()).toBe(
      Post.includes("comments").references("posts").toSql(),
    );
  });

  it("promotes includes to an eager join like the bare string", () => {
    expect(Post.includes("comments").references(":comments").toSql()).toBe(
      Post.includes("comments").references("comments").toSql(),
    );
  });
});
