import { describe, it, expect, vi } from "vitest";
import { fixtures } from "../test-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";

interface CollectionAssociationLike {
  reader: unknown;
  isStaleTarget(): boolean;
  reload(): Promise<unknown>;
  reset(): void;
  resetScope(): void;
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

    const proxy = association.reader as { toArray(): Promise<Post[]> };
    vi.mocked(association.isStaleTarget).mockRestore();

    expect(reload).toHaveBeenCalledTimes(1);
    expect((await proxy.toArray()).length).toBeGreaterThan(0);
  });

  it("shares the stale reload's in-flight load with the proxy, keeping a record built meanwhile", async () => {
    const author = await authors("david");
    const association = postsAssociation(author);
    await association.reader;
    const count = (await author.posts).length;

    vi.spyOn(association, "isStaleTarget").mockReturnValue(true);
    const findTarget = vi.spyOn(association as unknown as { findTarget(): unknown }, "findTarget");

    const proxy = association.reader as {
      build(attrs: Record<string, unknown>): Post;
      toArray(): Promise<Post[]>;
    };
    vi.mocked(association.isStaleTarget).mockRestore();
    const built = proxy.build({ title: "Built", body: "meanwhile" });

    const records = await proxy.toArray();
    expect(findTarget).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(count + 1);
    expect(records).toContain(built);
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
