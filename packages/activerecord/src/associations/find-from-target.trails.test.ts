/**
 * Trails-only: `find_from_target?` has one body in Rails
 * (collection_association.rb:308); `CollectionProxy#find_from_target?`
 * (collection_proxy.rb:1154) is a one-line delegation to it. Trails carried two
 * hand-maintained copies — one on `CollectionAssociation`, one on
 * `CollectionProxy` — which drifted once (the association copy gated on
 * `hasChangesToSave` where Rails uses `changed?`). These tests pin the
 * now-shared body from both hosts. Rails has no test for the predicate itself.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Developer, AuditLog } from "../test-helpers/models/developer.js";
import { fixtures } from "../test-fixtures.js";

interface AssociationLike {
  isFindFromTarget(): boolean;
  isLoaded(): boolean;
  target: Post[];
  concat(records: Post[]): Promise<unknown>;
}

interface ProxyLike {
  isFindFromTarget(): boolean;
  loaded: boolean;
  target: Post[];
  concat(record: Post): Promise<unknown>;
  load(): Promise<unknown>;
}

const associationOf = (owner: Author): AssociationLike =>
  (owner as unknown as { association(n: string): AssociationLike }).association("posts");

const proxyOf = (owner: Author): ProxyLike => (owner as unknown as { posts: ProxyLike }).posts;

describe("FindFromTarget", () => {
  fixtures(["authors", "posts", "developers"]);

  beforeAll(() => {
    registerModel(Author);
    registerModel(Post);
    registerModel(Developer);
    registerModel(AuditLog);
  });

  it("is false for an unloaded association with an untouched target", async () => {
    const author = (await Author.first())!;
    const assoc = associationOf(author);
    await assoc.concat([(await Post.last())!]);

    expect(assoc.isLoaded()).toBe(false);
    expect(assoc.target).toHaveLength(1);
    expect(assoc.isFindFromTarget()).toBe(false);
  });

  it("is true once a target record is changed", async () => {
    const author = (await Author.first())!;
    const assoc = associationOf(author);
    await assoc.concat([(await Post.last())!]);

    assoc.target[0].title = "a different title";

    expect(assoc.isLoaded()).toBe(false);
    expect(assoc.isFindFromTarget()).toBe(true);
  });

  it("is true for a new target record", async () => {
    const author = (await Author.first())!;
    const assoc = associationOf(author);
    assoc.target.push(Post.new({ title: "t", body: "b" }));

    expect(assoc.isFindFromTarget()).toBe(true);
  });

  it("is true for a new owner", () => {
    expect(proxyOf(Author.new({ name: "Bill" })).isFindFromTarget()).toBe(true);
  });

  it("is true for a strict_loading reflection", async () => {
    const developer = (await Developer.first())!;
    const proxy = (developer as unknown as { strictLoadingAuditLogs: ProxyLike })
      .strictLoadingAuditLogs;

    expect(proxy.loaded).toBe(false);
    expect(proxy.isFindFromTarget()).toBe(true);
  });

  it("the proxy shares the association's body", async () => {
    const author = (await Author.first())!;
    const proxy = proxyOf(author);
    await proxy.concat((await Post.last())!);

    expect(proxy.loaded).toBe(false);
    expect(proxy.isFindFromTarget()).toBe(false);

    proxy.target[0].title = "a different title";
    expect(proxy.isFindFromTarget()).toBe(true);

    await proxy.load();
    expect(proxy.loaded).toBe(true);
    expect(proxy.isFindFromTarget()).toBe(true);
  });
});
