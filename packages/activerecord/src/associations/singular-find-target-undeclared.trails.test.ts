/**
 * Trails-only surface: `findTarget` is an engine function callers reach with a
 * bare association name, where Rails reaches `SingularAssociation#find_target`
 * only as a method on an `Association` already built from a validated
 * reflection (`association.rb:41-45`). A name the model never declared raises
 * `AssociationNotFoundError` from `association` (`associations.rb:56`) in Rails,
 * so the engine entry point has to raise the same error rather than rebuilding a
 * WHERE clause from raw options. No verbatim Rails test mirrors this, because in
 * Rails the loader is unreachable for an undeclared name.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { AssociationNotFoundError } from "./errors.js";
import { findTarget } from "./singular-association.js";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { Author } from "../test-helpers/models/author.js";

describe("SingularAssociation#findTarget — undeclared association name", () => {
  const { posts } = fixtures(["posts", "authors"]);

  beforeAll(() => {
    registerModel(Post);
    registerModel(Author);
  });

  it("raises AssociationNotFoundError for a belongs_to name with no reflection", async () => {
    const post = posts("welcome");
    await expect(
      findTarget(post, "undeclaredAuthor", { className: "Author" }, "belongsTo"),
    ).rejects.toThrow(AssociationNotFoundError);
  });

  it("raises AssociationNotFoundError for a has_one name with no reflection", async () => {
    const post = posts("welcome");
    await expect(
      findTarget(post, "undeclaredComment", { className: "Comment" }, "hasOne"),
    ).rejects.toThrow(AssociationNotFoundError);
  });
});
