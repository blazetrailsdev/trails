import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";

import { Author } from "../../models/author.js";
import { Post } from "../../models/post.js";
import { fixtures } from "../../support/use-fixtures.js";
import type { Relation } from "../../../lib/relation.js";

interface AssociationLike {
  isSkipStatementCache(scope: Relation<Author>): boolean;
}

describe("Association#skip_statement_cache?", () => {
  const { posts } = fixtures(["authors", "posts"]);

  const association = (post: Post): AssociationLike =>
    (post as unknown as { association(name: string): AssociationLike }).association("author");

  it("is true while the target class has scope attributes", async () => {
    constSet(TopLevel, "Author", Author);
    constSet(TopLevel, "Post", Post);
    const post = await Post.find(posts("welcome").id);
    const assoc = association(post);

    expect(assoc.isSkipStatementCache(Author.all())).toBe(false);
    Author.where({ name: "David" }).scoping(() => {
      expect(assoc.isSkipStatementCache(Author.all())).toBe(true);
    });
  });
});
