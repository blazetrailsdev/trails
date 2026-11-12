import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";

import { Author } from "../../models/author.js";
import { Post } from "../../models/post.js";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";

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
    constSet(TopLevel, "Author", Author);
    constSet(TopLevel, "Post", Post);
    const author = await Author.find(authors("david").id);
    const post = await Post.find(posts("welcome").id);
    const assoc = association(post);

    assoc.target = author;

    expect(assoc.isLoaded()).toBe(true);
  });

  it("snapshots the stale state so a later foreign key change is stale", async () => {
    constSet(TopLevel, "Author", Author);
    constSet(TopLevel, "Post", Post);
    const author = await Author.find(authors("david").id);
    const post = await Post.find(posts("welcome").id);
    const assoc = association(post);

    assoc.target = author;
    expect(assoc.isStaleTarget()).toBe(false);

    post.set("author_id", authors("mary").id);

    expect(assoc.isStaleTarget()).toBe(true);
  });
});
