import { describe, it, expect } from "vitest";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { fixtures } from "../test-fixtures.js";

interface PostsAssociation {
  target: Post[];
  concat(...records: Post[]): Promise<Post[] | undefined> | Post[] | undefined;
  delete(...records: Post[]): Promise<Post[] | undefined> | Post[] | undefined;
}

const postsAssociation = (owner: Author): PostsAssociation =>
  (owner as unknown as { association(n: string): PostsAssociation }).association("posts");

describe("CollectionSyncRemovalChain", () => {
  fixtures(["authors", "posts"]);

  it("concat on a new owner buffers the record before the next statement", () => {
    const author = Author.new({ name: "Kelly" });
    const post = Post.new({ title: "Welcome", body: "hi" });
    const assoc = postsAssociation(author);

    const result = assoc.concat(post);

    expect(result).not.toBeInstanceOf(Promise);
    expect(assoc.target).toEqual([post]);
  });

  it("delete on a new owner prunes the record before the next statement", () => {
    const author = Author.new({ name: "Kelly" });
    const post = Post.new({ title: "Welcome", body: "hi" });
    const assoc = postsAssociation(author);
    void assoc.concat(post);

    const result = assoc.delete(post);

    expect(result).not.toBeInstanceOf(Promise);
    expect(assoc.target).toEqual([]);
  });

  it("buffers every record after an async insert fails", async () => {
    const author = await Author.create({ name: "Kelly" });
    const first = Post.new({ title: "First", body: "hi" });
    const second = Post.new({ title: "Second", body: "hi" });
    const assoc = postsAssociation(author);
    (assoc as unknown as { insertRecord(): Promise<boolean> }).insertRecord = () =>
      Promise.resolve(false);

    await assoc.concat(first, second);

    expect(assoc.target).toEqual([first, second]);
  });

  it("delete on a persisted owner still answers a promise", async () => {
    const author = await Author.create({ name: "Kelly" });
    const post = await (
      author as unknown as { posts: { create(a: object): Promise<Post> } }
    ).posts.create({ title: "Welcome", body: "hi" });
    const assoc = postsAssociation(author);

    const result = assoc.delete(post);

    expect(result).toBeInstanceOf(Promise);
    expect(await result).toEqual([post]);
    expect(assoc.target).toEqual([]);
  });
});
