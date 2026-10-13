import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { assertNoQueries, assertQueriesCount } from "../testing/query-assertions.js";
import { fixtures } from "../test-helpers/use-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Category } from "../test-helpers/models/category.js";

describe("EagerAssociationTest", () => {
  const { authors, posts } = fixtures([
    "authors",
    "posts",
    "comments",
    "categories",
    "categoriesPosts",
  ]);
  registerModel(Author);
  registerModel(Post);
  registerModel(Comment);
  registerModel(Category);

  it("eager association loading with explicit join belongs to", async () => {
    const welcome = posts("welcome");
    const david = authors("david");

    const posts2 = await Post.where({ id: welcome.id }).eagerLoad(":author");
    expect(posts2).toHaveLength(1);
    const btProxy = posts2[0].association("author");
    expect(btProxy.loaded).toBe(true);
    expect((btProxy.target as Author).name).toBe(david.name);
  });

  it("eager association loading with explicit join has one", async () => {
    const david = authors("david");

    const users = await Author.where({ id: david.id }).eagerLoad(":post");
    expect(users).toHaveLength(1);
    const hoProxy = users[0].association("post");
    expect(hoProxy.loaded).toBe(true);
    expect(hoProxy.target).not.toBeNull();
  });

  it("eager association loading with explicit join marks empty association loaded", async () => {
    const author = await Author.create({ name: "NoPostsAuthor" });

    const authorsArr = await Author.where({ id: author.id }).eagerLoad(":posts");
    expect(authorsArr).toHaveLength(1);
    const proxy = authorsArr[0].association("posts");
    expect(proxy.loaded).toBe(true);
    expect(proxy.target).toEqual([]);
  });

  it("joins with multiple includes should preload via joins", async () => {
    let post: Post | undefined;
    await assertQueriesCount(1, false, async () => {
      const loaded = await Post.includes(":comments", ":author")
        .joins(":comments")
        .order("posts.id desc");
      post = loaded[0];
    });
    await assertNoQueries(false, async () => {
      expect(await post!.comments.length()).not.toBe(0);
      expect(post!.association("author").target).toBeTruthy();
    });
  });

  it("eager association loading with explicit join habtm", async () => {
    const rel = Post.all().eagerLoad(":categories").order("posts.id");
    const sql = rel.toSql();
    expect(sql).toMatch(/LEFT OUTER JOIN.*categories_posts/);
    expect(sql).toMatch(/LEFT OUTER JOIN.*categories[^_]/);

    const loaded = await rel;
    const welcome = loaded.find((p) => p.id === posts("welcome").id)!;
    const thinking = loaded.find((p) => p.id === posts("thinking").id)!;
    expect(await welcome.categories.length()).toBe(2);
    expect(await thinking.categories.length()).toBe(1);
  });

  it("eager association loading with habtm via preload", async () => {
    const loaded = await Post.all().preload(":categories").order("posts.id");
    const welcome = loaded.find((p) => p.id === posts("welcome").id)!;
    expect(await welcome.categories.length()).toBe(2);
  });
});
