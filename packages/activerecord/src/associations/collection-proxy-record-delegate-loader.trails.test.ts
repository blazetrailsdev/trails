import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";

registerModel(Author);
registerModel(Post);

describe("CollectionProxy to: :records delegates share one loader", () => {
  fixtures(["authors", "posts"]);

  const newOwner = () => Author.new({ name: "unsaved" });

  it("a Rails-named delegate marks the proxy loaded", async () => {
    const author = newOwner();
    const posts = author.posts;

    expect(posts.isLoaded).toBe(false);
    await posts.each(() => {});
    expect(posts.isLoaded).toBe(true);
  });

  it("a JS-named delegate marks the proxy loaded", async () => {
    const author = newOwner();
    const posts = author.posts;

    expect(posts.isLoaded).toBe(false);
    await posts.map((p: Post) => p);
    expect(posts.isLoaded).toBe(true);
  });

  it("both spellings leave the proxy in the same loaded state", async () => {
    const railsName = newOwner().posts;
    const jsName = newOwner().posts;

    await railsName.index(() => true);
    await jsName.filter(() => true);

    expect(railsName.isLoaded).toBe(jsName.isLoaded);
  });

  it("both spellings see records buffered on the unsaved owner", async () => {
    const author = newOwner();
    const posts = author.posts;
    const post = await posts.build({ title: "t", body: "b" });

    expect(await posts.map((p: Post) => p.title)).toEqual([post.title]);
    const seen: Post[] = [];
    await posts.each((p: Post) => seen.push(p));
    expect(seen).toEqual([post]);
  });
});
