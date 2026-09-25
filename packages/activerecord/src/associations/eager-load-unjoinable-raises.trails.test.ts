import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Tagging } from "../test-helpers/models/tagging.js";
import { Author } from "../test-helpers/models/author.js";
import { Essay } from "../test-helpers/models/essay.js";
import { EagerLoadPolymorphicError, type Base } from "../index.js";

describe("eager_load with an unresolvable association", () => {
  const { authors } = fixtures(["posts", "comments", "taggings", "authors", "essays"]);

  beforeAll(() => {
    [Post, Comment, Tagging, Author, Essay].forEach((m) =>
      registerModel(m as unknown as typeof Base),
    );
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
    await expect(Post.all().eagerLoad(":monkeys").isExists()).rejects.toThrow(expected);
  });

  it("raises EagerLoadPolymorphicError on the exists? path", async () => {
    await expect(Tagging.all().eagerLoad(":taggable").isExists()).rejects.toThrow(
      /Cannot eagerly load the polymorphic association :taggable\./,
    );
  });

  it("raises on the pluck path", async () => {
    await expect(Post.all().eagerLoad(":monkeys").pluck("title")).rejects.toThrow(expected);
  });

  it("raises EagerLoadPolymorphicError on the calculation paths", async () => {
    const essays = authors("david").essays;
    await expect(essays.eagerLoad(":writer").sum("writer_id")).rejects.toThrow(
      EagerLoadPolymorphicError,
    );
    await expect(essays.eagerLoad(":writer").minimum("writer_id")).rejects.toThrow(
      EagerLoadPolymorphicError,
    );
    await expect(essays.eagerLoad(":writer").group("writer_type").sum("writer_id")).rejects.toThrow(
      EagerLoadPolymorphicError,
    );
    expect(await essays.eagerLoad(":writer").isExists(false)).toBe(false);
    await expect(essays.eagerLoad(":nope").count()).rejects.toThrow(/misspelled it/);
  });
});
