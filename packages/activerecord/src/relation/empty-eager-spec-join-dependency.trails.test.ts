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
