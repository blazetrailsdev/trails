/**
 * Convergence guard: `Association#target=` (association.rb:100-103) is the
 * ivar write AND `loaded!`, so an assigned target is loaded and carries the
 * `@stale_state` snapshot `loaded!` takes (association.rb:86-89). trails' base
 * setter wrote the ivar only, leaving `@loaded` false and the snapshot unset,
 * so `stale_target?` could never fire for an assigned target.
 *
 * Rails has no dedicated test for the setter — its contract is exercised
 * through every `self.target =` caller — so this pins it directly, on the
 * canonical `Post` → `author` belongs_to.
 */
import { describe, it, expect } from "vitest";

import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";

interface AssociationLike {
  target: unknown;
  isLoaded(): boolean;
  isStaleTarget(): boolean;
}

describe("Association#target=", () => {
  const { authors, posts } = fixtures(["authors", "posts"]);

  const association = (post: Post): AssociationLike =>
    (post as unknown as { association(name: string): AssociationLike }).association("author");

  it("sets the loaded flag", async () => {
    registerModel(Author);
    registerModel(Post);
    const author = await Author.find(authors("david").id);
    const post = await Post.find(posts("welcome").id);
    const assoc = association(post);

    assoc.target = author;

    expect(assoc.isLoaded()).toBe(true);
  });

  it("snapshots the stale state so a later foreign key change is stale", async () => {
    registerModel(Author);
    registerModel(Post);
    const author = await Author.find(authors("david").id);
    const post = await Post.find(posts("welcome").id);
    const assoc = association(post);

    assoc.target = author;
    expect(assoc.isStaleTarget()).toBe(false);

    post.set("author_id", authors("mary").id);

    expect(assoc.isStaleTarget()).toBe(true);
  });
});
