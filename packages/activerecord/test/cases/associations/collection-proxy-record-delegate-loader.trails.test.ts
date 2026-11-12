import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";
import { Author } from "../../models/author.js";
import { Post } from "../../models/post.js";

constSet(TopLevel, "Author", Author);
constSet(TopLevel, "Post", Post);

describe("CollectionProxy to: :records delegates share one loader", () => {
  fixtures(["authors", "posts"]);

  const newOwner = () => new Author({ name: "unsaved" });

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
