import { describe, it, expect } from "vitest";
import "../index.js";
import { Post } from "../test-helpers/models/post.js";
import { fixtures } from "../test-fixtures.js";

describe("a leading-colon references value", () => {
  fixtures(["posts", "comments"]);

  it("is subtracted from the joined tables like the bare string", () => {
    expect(Post.includes(":comments").references(":posts").toSql()).toBe(
      Post.includes(":comments").references("posts").toSql(),
    );
  });

  it("promotes includes to an eager join like the bare string", () => {
    expect(Post.includes(":comments").references(":comments").toSql()).toBe(
      Post.includes(":comments").references("comments").toSql(),
    );
  });
});
