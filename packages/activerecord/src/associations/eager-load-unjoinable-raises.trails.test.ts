import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import type { Base } from "../index.js";

describe("eager_load with an unresolvable association", () => {
  fixtures(["posts", "comments"]);

  beforeAll(() => {
    [Post, Comment].forEach((m) => registerModel(m as unknown as typeof Base));
  });

  const expected = /Can't join 'Post' to association named 'monkeys'; perhaps you misspelled it\?/;

  it("raises on the record-loading path", async () => {
    await expect(Post.all().eagerLoad(":monkeys").toArray()).rejects.toThrow(expected);
  });

  it("raises on a nested spec's inner segment", async () => {
    await expect(Post.all().eagerLoad({ ":comments": ":monkeys" }).toArray()).rejects.toThrow(
      /Can't join 'Comment' to association named 'monkeys'/,
    );
  });

  it("raises on the calculation path", async () => {
    await expect(Post.all().eagerLoad(":monkeys").count()).rejects.toThrow(expected);
    await expect(Post.all().eagerLoad(":monkeys").sum("legacyCommentsCount")).rejects.toThrow(
      expected,
    );
  });

  it("raises on the exists? path", async () => {
    await expect(Post.all().eagerLoad(":monkeys").exists()).rejects.toThrow(expected);
  });

  it("raises on the pluck path", async () => {
    await expect(Post.all().eagerLoad(":monkeys").pluck("title")).rejects.toThrow(expected);
  });
});
