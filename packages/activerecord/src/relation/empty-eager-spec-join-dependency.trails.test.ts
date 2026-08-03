/**
 * A blank-but-present eager spec (`eagerLoad([])`, `eagerLoad({})`) makes
 * `eager_loading?` true — `eager_load_values.any?` is true for `[[]]`
 * (relation.rb:414, query_methods.rb:295) — while
 * `JoinDependency.walk_tree` folds it to an empty tree, so the JoinDependency
 * has zero nodes.
 *
 * Rails does not special-case that: `apply_join_dependency`
 * (finder_methods.rb:457) builds the JoinDependency, joins it (contributing no
 * JOINs), and runs the ordinary query. trails carried three
 * `jd.nodes.length === 0` degrade branches — in `_executeEagerLoad`, the
 * `pluck` eager path and the `cacheVersion` eager path — which were load-bearing
 * only while the preload-fallback lane existed (deleted in #5968). This file
 * covers the shape that reaches those sites, so the ordinary Rails-shaped flow
 * stays correct without them.
 *
 * trails-only (hence `.trails.test.ts`): Rails has no test for a blank eager
 * spec that is actually executed.
 */
import { describe, it, expect } from "vitest";
import { Base } from "../index.js";
import { Post } from "../test-helpers/models/post.js";
import { Topic } from "../test-helpers/models/topic.js";
import { fixtures } from "../test-fixtures.js";

describe("blank eager spec with a zero-node join dependency", () => {
  fixtures(["posts", "comments", "topics"]);

  it("loads the base records", async () => {
    const posts = await Post.eagerLoad([]).order("id");
    const plain = await Post.order("id");
    expect(posts.map((p) => p.id)).toEqual(plain.map((p) => p.id));
  });

  it("loads the base records for a blank hash spec", async () => {
    const posts = await Post.eagerLoad({}).order("id");
    expect(posts.length).toBeGreaterThan(0);
  });

  it("plucks from the base relation", async () => {
    const ids = await Post.eagerLoad([]).order("id").pluck("id");
    const plain = await Post.order("id").pluck("id");
    expect(ids).toEqual(plain);
  });

  it("computes a cache version from the base relation", async () => {
    const original = Base.collectionCacheVersioning;
    Base.collectionCacheVersioning = true;
    try {
      const version = await Topic.eagerLoad([]).cacheVersion();
      const plain = await Topic.all().cacheVersion();
      expect(version).toEqual(plain);
    } finally {
      Base.collectionCacheVersioning = original;
    }
  });
});
