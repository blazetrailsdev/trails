import { describe, it, expect } from "vitest";
import { fixtures } from "../../support/use-fixtures.js";
import { Post } from "../../models/post.js";
import { Tagging } from "../../models/tagging.js";
import { EagerLoadPolymorphicError } from "../../../lib/index.js";
import "../../models/comment.js";
import "../../models/author.js";
import "../../models/essay.js";

describe("eager_load with an unresolvable association", () => {
  const { authors } = fixtures(["posts", "comments", "taggings", "authors", "essays"]);

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
      /Cannot eagerly load the polymorphic association :taggable$/,
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
