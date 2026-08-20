/**
 * An eager-load spec JoinDependency can't resolve raises on EVERY path, not
 * just the record-loading one.
 *
 * `JoinDependency#build` used to accept a `fallbackAssociations` out-parameter:
 * a top-level spec whose segment couldn't be JOINed was rolled back and handed
 * to the preloader, so a load could silently degrade while
 * `count`/`sum`/`exists?` — which validate through `Relation#_checkEagerLoadable`
 * rather than building the tree — raised. Rails has no such mode
 * (`join_dependency.rb:228` only ever raises via `find_reflection`), and the
 * lane is gone; these cover that the loading and calculation/exists paths now
 * agree on raising.
 */
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
