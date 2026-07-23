/**
 * Trails-only: `find_from_target?` has one body in Rails
 * (vendor/rails/activerecord/lib/active_record/associations/collection_association.rb:308);
 * `CollectionProxy#find_from_target?` (collection_proxy.rb:1154) is a one-line
 * delegation to it. Trails carried two hand-maintained copies — one on
 * `CollectionAssociation`, one on `CollectionProxy` — which drifted once (the
 * association copy gated on `hasChangesToSave` where Rails uses `changed?`).
 * These tests pin the now-shared body from both hosts, including the
 * `record.changed?` clause that the association copy's drift had disabled.
 * There is no Rails test for this predicate directly.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { fixtures } from "../test-helpers/fixtures.js";

interface FindFromTarget {
  isFindFromTarget(): boolean;
  isLoaded?(): boolean;
  loaded?: boolean;
  target: Post[];
  concat(records: Post[] | Post): Promise<unknown>;
  load?(): Promise<unknown>;
}

const associationOf = (owner: Author): FindFromTarget =>
  (owner as unknown as { association(n: string): FindFromTarget }).association("posts");

const proxyOf = (owner: Author): FindFromTarget =>
  (owner as unknown as { posts: FindFromTarget }).posts;

describe("FindFromTarget", () => {
  fixtures(["authors", "posts"]);

  beforeAll(() => {
    registerModel(Author);
    registerModel(Post);
  });

  it("is false for an unloaded association with an untouched target", async () => {
    const author = (await Author.first())!;
    const assoc = associationOf(author);
    const post = (await Post.last())!;
    await assoc.concat([post]);

    expect(assoc.isLoaded!()).toBe(false);
    expect(assoc.target).toHaveLength(1);
    expect(assoc.isFindFromTarget()).toBe(false);
  });

  it("is true once a target record is changed", async () => {
    const author = (await Author.first())!;
    const assoc = associationOf(author);
    const post = (await Post.last())!;
    await assoc.concat([post]);

    assoc.target[0].title = "a different title";

    expect(assoc.isLoaded!()).toBe(false);
    expect(assoc.isFindFromTarget()).toBe(true);
  });

  it("is true for a new target record", async () => {
    const author = (await Author.first())!;
    const assoc = associationOf(author);
    assoc.target.push(Post.new({ title: "t", body: "b" }));

    expect(assoc.isFindFromTarget()).toBe(true);
  });

  it("is true for a new owner", async () => {
    const author = Author.new({ name: "Bill" });

    expect(proxyOf(author).isFindFromTarget()).toBe(true);
  });

  it("the proxy shares the association's body", async () => {
    const author = (await Author.first())!;
    const proxy = proxyOf(author);
    const post = (await Post.last())!;
    await proxy.concat(post);

    expect(proxy.loaded).toBe(false);
    expect(proxy.isFindFromTarget()).toBe(false);

    proxy.target[0].title = "a different title";
    expect(proxy.isFindFromTarget()).toBe(true);

    await proxy.load!();
    expect(proxy.loaded).toBe(true);
    expect(proxy.isFindFromTarget()).toBe(true);
  });
});
