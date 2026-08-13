/**
 * Trails-only: Rails' `CollectionAssociation#concat` / `#delete` have finished
 * mutating the target by the time they return
 * (vendor/rails/activerecord/lib/active_record/associations/collection_association.rb:123-135,
 * :186-197), and for a NEW owner neither does any I/O — `concat_records` skips
 * `insert_record` under `unless owner.new_record?` (:434-448) and
 * `remove_records` skips `delete_records` when `existing_records` is empty
 * (:404-405). The chain is therefore restated as `Promise<T> | T` bodies: they
 * run inline and answer a promise only when a call actually owed I/O, so
 * `replace`'s new-owner arm — reached synchronously from the constructor's
 * mass-assignment dispatch — can drive it. There is no Rails
 * test for this deviation.
 */
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
    // Rails short-circuits only `insert_record` once `result` is false
    // (collection_association.rb:441-449); `add_to_target` still runs for every
    // remaining record, so both stay buffered.
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
