import { describe, it, expect, beforeAll } from "vitest";
import { association, registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";

describe("reload — association owner re-point", () => {
  fixtures({});

  beforeAll(() => {
    registerModel(Author);
    registerModel(Post);
  });

  it("resolves associations against the reloaded record after reload", async () => {
    const author = await Author.create({ name: "Dev" });
    await Post.create({ title: "a", body: "a", author_id: author.id as number });
    await Post.create({ title: "b", body: "b", author_id: author.id as number });

    const before = association<Post>(author, "posts");
    await before.load();
    expect(before.target.length).toBe(2);

    await author.reload();

    const after = association<Post>(author, "posts");
    expect(after.proxyAssociation.owner).toBe(author);
    await after.load();
    expect(after.target.length).toBe(2);
  });
});
