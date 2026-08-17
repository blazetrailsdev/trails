/**
 * Trails-only: pins `CollectionAssociation#reader`
 * (collection_association.rb:33-42) to Rails' four lines — `ensure_klass_exists!`,
 * the stale-target `reload`, `@proxy ||= CollectionProxy.create(klass, self)`,
 * and `@proxy.reset_scope`. Rails reaches `reader` through the generated
 * accessor, so it has no test of its own; these reach the OO association
 * directly because that is where the port had drifted — the stale-reload arm
 * lived in a callerless `asyncReader` and `reader` returned the bare target.
 */
import { describe, it, expect, vi } from "vitest";
import { fixtures } from "../test-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";

interface CollectionAssociationLike {
  reader: Promise<Post[]>;
  isStaleTarget(): boolean;
  reload(): Promise<unknown>;
  resetScope?(): void;
}

const postsAssociation = (author: Author): CollectionAssociationLike =>
  (author as unknown as { association(name: string): CollectionAssociationLike }).association(
    "posts",
  );

describe("CollectionAssociation#reader", () => {
  const { authors } = fixtures(["authors", "posts"]);

  it("reloads a stale target before answering", async () => {
    const author = await authors("david");
    const association = postsAssociation(author);
    await association.reader;

    vi.spyOn(association, "isStaleTarget").mockReturnValue(true);
    const reload = vi.spyOn(association, "reload");

    await association.reader;

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload a fresh target", async () => {
    const author = await authors("david");
    const association = postsAssociation(author);
    await association.reader;

    const reload = vi.spyOn(association, "reload");
    await association.reader;

    expect(reload).not.toHaveBeenCalled();
  });

  it("memoizes the proxy and resets its scope on every read", async () => {
    const author = await authors("david");
    const association = postsAssociation(author);

    const proxy = author.posts;
    await association.reader;

    const resetScope = vi.spyOn(proxy, "resetScope");
    await association.reader;

    expect(resetScope).toHaveBeenCalledTimes(1);
    expect(author.posts).toBe(proxy);
  });
});
