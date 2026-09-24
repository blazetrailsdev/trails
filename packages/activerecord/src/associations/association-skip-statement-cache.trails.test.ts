import { describe, it, expect } from "vitest";

import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import type { Relation } from "../relation.js";
import type { Base } from "../base.js";

interface AssociationLike {
  isSkipStatementCache(scope: Relation<Base>): boolean;
}

describe("Association#skip_statement_cache?", () => {
  const { posts } = fixtures(["authors", "posts"]);

  const association = (post: Post): AssociationLike =>
    (post as unknown as { association(name: string): AssociationLike }).association("author");

  it("is true while the target class has scope attributes", async () => {
    registerModel(Author);
    registerModel(Post);
    const post = await Post.find(posts("welcome").id);
    const assoc = association(post);

    expect(assoc.isSkipStatementCache(Author.all())).toBe(false);
    Author.where({ name: "David" }).scoping(() => {
      expect(assoc.isSkipStatementCache(Author.all())).toBe(true);
    });
  });
});
