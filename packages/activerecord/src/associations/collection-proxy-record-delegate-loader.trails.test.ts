/**
 * Trails-only surface: Rails resolves the whole `delegate ... to: :records`
 * list (delegation.rb:101-104) through one method — `CollectionProxy#records`
 * (collection_proxy.rb:1024-1026), which is `load_target`
 * (collection_association.rb:270-278) and therefore always ends in `loaded!`.
 * Ruby cannot split that list, so there is no Rails test to mirror: trails
 * spells some delegates with their Rails name (`each`, `index`, …) and some
 * with their JS name (`map`, `filter`, …), and the two halves used to reach
 * two different loaders with different caching rules. This pins that every
 * member of the one list leaves the proxy in the same `loaded?` state.
 */
import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";

registerModel(Author);
registerModel(Post);

describe("CollectionProxy to: :records delegates share one loader", () => {
  fixtures(["authors", "posts"]);

  // A new-record owner is the null scope (collection_association.rb:298-306),
  // the one place the two loaders disagreed.
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
