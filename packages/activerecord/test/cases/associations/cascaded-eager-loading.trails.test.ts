import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";
import { Base } from "../../../lib/base.js";
import { Author } from "../../models/author.js";
import { Post } from "../../models/post.js";
import { Comment } from "../../models/comment.js";

describe("CascadedEagerLoadingTest", () => {
  fixtures(["authors", "posts", "comments"]);
  constSet(TopLevel, "Author", Author);
  constSet(TopLevel, "Post", Post);
  Comment.inheritanceColumn = "type";
  constSet(TopLevel, "Comment", Comment);

  const targetArr = (rec: Base, name: string): Base[] =>
    (rec.association(name).target as Base[]) ?? [];
  const commentCount = (posts: Base[]): number =>
    posts.reduce((sum, p) => sum + targetArr(p, "comments").length, 0);

  it("eager association loading dedups a manual join coinciding with an eager root", async () => {
    const loaded = await Author.all()
      .joins(":posts")
      .eagerLoad({ ":posts": ":comments" })
      .order("authors.id");
    expect(loaded).toHaveLength(3);
    expect(targetArr(loaded[0], "posts")).toHaveLength(5);
    expect(targetArr(loaded[1], "posts")).toHaveLength(3);
    expect(commentCount(targetArr(loaded[0], "posts"))).toBe(11);
  });

  it("eager association loading dedups a single-step manual join and eager root", async () => {
    const loaded = await Author.all().joins(":posts").eagerLoad(":posts").order("authors.id");
    expect(loaded).toHaveLength(3);
    expect(targetArr(loaded[0], "posts")).toHaveLength(5);
    expect(targetArr(loaded[1], "posts")).toHaveLength(3);
  });

  it("eager association loading dedups a manual join coinciding with a dotted eager root", async () => {
    const loaded = await Author.all()
      .joins(":posts")
      .eagerLoad({ posts: "comments" })
      .order("authors.id");
    expect(loaded).toHaveLength(3);
    expect(targetArr(loaded[0], "posts")).toHaveLength(5);
    expect(commentCount(targetArr(loaded[0], "posts"))).toBe(11);
  });

  it("eager association loading dedups a nested hash-form manual join and eager spec", async () => {
    const loaded = await Author.all()
      .joins({ ":posts": ":comments" })
      .eagerLoad({ ":posts": ":comments" })
      .order("authors.id");
    expect(loaded).toHaveLength(2);
    expect(targetArr(loaded[0], "posts")).toHaveLength(4);
    expect(commentCount(targetArr(loaded[0], "posts"))).toBe(11);
    expect(targetArr(loaded[1], "posts")).toHaveLength(1);
    expect(commentCount(targetArr(loaded[1], "posts"))).toBe(1);
  });

  it("eager association loading dedups a through-association intermediate join and eager spec", async () => {
    const rel = Author.all().joins(":comments").eagerLoad(":comments").order("authors.id");
    const sql = rel.toSql();
    expect(sql).not.toMatch(/posts_authors/);
    const loaded = await rel;
    expect(loaded).toHaveLength(2);
    expect(targetArr(loaded[0], "comments")).toHaveLength(11);
    expect(targetArr(loaded[1], "comments")).toHaveLength(1);
  });
});
