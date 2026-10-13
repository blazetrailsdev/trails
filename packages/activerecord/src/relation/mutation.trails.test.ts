import { describe, it, expect } from "vitest";
import "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";

fixtures([]);

describe("RelationMutationTest", () => {
  it("uniq! deduplicates the named clause array", () => {
    const rel = Post.group("title").group("title").group("author");
    expect(rel.groupValues).toEqual(["title", "title", "author"]);
    rel.uniqBang("group");
    expect(rel.groupValues).toEqual(["title", "author"]);
  });

  it("uniq! is a no-op for unknown clause names", () => {
    const rel = Post.group("title");
    expect(() => rel.uniqBang("unknown_clause")).not.toThrow();
  });

  it("uniq! with no argument is a no-op", () => {
    const rel = Post.group("title");
    expect(() => rel.uniqBang()).not.toThrow();
  });
});
