import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeAll } from "vitest";
import { fixtures } from "../../support/use-fixtures.js";
import { Author } from "../../models/author.js";
import { Post } from "../../models/post.js";

describe("reload — association owner re-point", () => {
  fixtures({});

  beforeAll(() => {
    constSet(TopLevel, "Author", Author);
    constSet(TopLevel, "Post", Post);
  });

  it("resolves associations against the reloaded record after reload", async () => {
    const author = await Author.create({ name: "Dev" });
    await Post.create({ title: "a", body: "a", author_id: author.id as number });
    await Post.create({ title: "b", body: "b", author_id: author.id as number });

    const before = author.posts;
    await before.load();
    expect(before.target.length).toBe(2);

    await author.reload();

    const after = author.posts;
    expect(after.proxyAssociation.owner).toBe(author);
    await after.load();
    expect(after.target.length).toBe(2);
  });
});
