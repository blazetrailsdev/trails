import { describe, it, expect } from "vitest";
import "../index.js";
import { StatementInvalid } from "../index.js";
import { MissingAttributeError } from "@blazetrails/activemodel";
import { BigDecimal } from "@blazetrails/activesupport";
import { fixtures } from "../test-fixtures.js";
import { Post, PostWithDefaultSelect } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { registerModel } from "../associations.js";
import { quoteTableName } from "../support/quote-regex.js";
import { regexpEscape } from "@blazetrails/ruby-compat";

registerModel(Post);
registerModel(Comment);

describe("SelectTest", () => {
  fixtures(["posts", "comments"]);
  const q = (name: string) => regexpEscape(quoteTableName(name));

  it("select with nil argument", () => {
    const expected = new RegExp(`^SELECT ${q("posts.title")} FROM`);
    expect(
      Post.select(null as never)
        .select("title")
        .toSql(),
    ).toMatch(expected);
  });

  it("select with non field values", () => {
    const expected = new RegExp(`^SELECT 1, foo\\(\\), ${q("bar")} FROM`);
    expect(Post.select("1", "foo()", ":bar").toSql()).toMatch(expected);
  });

  it("select with non field hash values", () => {
    const expected = new RegExp(
      `^SELECT 1 AS ${q("a")}, foo\\(\\) AS ${q("b")}, ${q("bar")} AS ${q("c")} FROM`,
    );
    expect(Post.select({ "1": ":a", "foo()": ":b", ":bar": ":c" } as never).toSql()).toMatch(
      expected,
    );
  });

  it("select with hash argument", async () => {
    const post = (await Post.select({
      "UPPER(title)": ":title",
      posts: { title: ":post_title" },
    }).first()) as never as { title: string; readAttribute(n: string): unknown };

    expect(post.title).toBe("WELCOME TO THE WEBLOG");
    expect(post.readAttribute("post_title")).toBe("Welcome to the weblog");
  });

  it("select with reserved words aliases", async () => {
    const post = (await Post.select({
      "UPPER(title)": ":from",
      title: ":group",
    }).first()) as never as { readAttribute(n: string): unknown };

    expect(post.readAttribute("from")).toBe("WELCOME TO THE WEBLOG");
    expect(post.readAttribute("group")).toBe("Welcome to the weblog");
  });

  it("select with one level hash argument", async () => {
    const post = (await Post.select({
      "UPPER(title)": ":title",
      title: ":post_title",
    }).first()) as never as { title: string; readAttribute(n: string): unknown };

    expect(post.title).toBe("WELCOME TO THE WEBLOG");
    expect(post.readAttribute("post_title")).toBe("Welcome to the weblog");
  });

  it("select with not exists field", async () => {
    const expected = new RegExp(`^SELECT ${q("foo")} AS ${q("post_title")} FROM`);
    expect(Post.select({ [":foo"]: ":post_title" } as never).toSql()).toMatch(expected);

    await expect(Post.select({ [":foo"]: ":post_title" } as never).take()).rejects.toThrow(
      StatementInvalid,
    );
  });

  it("select with hash with not exists field", async () => {
    const expected = new RegExp(`^SELECT ${q("posts.bar")} AS ${q("post_title")} FROM`);
    expect(Post.select({ posts: { bar: ":post_title" } }).toSql()).toMatch(expected);

    await expect(Post.select({ posts: { boo: ":post_title" } }).take()).rejects.toThrow(
      StatementInvalid,
    );
  });

  it("select with hash array value with not exists field", async () => {
    const expected = new RegExp(`^SELECT ${q("posts.bar")}, ${q("posts.id")} FROM`);
    expect(Post.select({ posts: [":bar", ":id"] }).toSql()).toMatch(expected);

    await expect(Post.select({ posts: [":bar", ":id"] }).take()).rejects.toThrow(StatementInvalid);
  });

  it("select with hash and table alias", async () => {
    const post = (await Post.joins(":comments", ":commentsWithExtend")
      .select("title", {
        posts: { title: ":post_title" },
        comments: { body: ":comment_body" },
        commentsWithExtend: { body: ":comment_body_2" },
      } as never)
      .take()) as never as { title: string; readAttribute(n: string): unknown };

    expect(post.readAttribute("post_title")).toBe(post.title);
    expect(post.readAttribute("comment_body")).not.toBeNull();
    expect(post.readAttribute("comment_body_2")).not.toBeNull();
  });

  it("select with invalid nested field", async () => {
    await expect(Post.select({ posts: { "UPPER(title)": ":post_title" } }).take()).rejects.toThrow(
      StatementInvalid,
    );
    await expect(Post.select({ posts: ["UPPER(title)"] }).take()).rejects.toThrow(StatementInvalid);
  });

  it("select with hash argument without aliases", async () => {
    const post = (await Post.select({
      posts: [":title", "title as post_title"],
    }).first()) as never as { title: string; readAttribute(n: string): unknown };

    expect(post.title).toBe("Welcome to the weblog");
    expect(post.readAttribute("post_title")).toBe("Welcome to the weblog");
  });

  it("select with hash argument with few tables", async () => {
    const post = (await Post.joins(":comments")
      .select("title", {
        posts: { title: ":post_title" },
        comments: { body: ":comment_body" },
      } as never)
      .take()) as never as { title: string; readAttribute(n: string): unknown };

    expect(post.readAttribute("post_title")).toBe(post.title);
    expect(post.readAttribute("comment_body")).not.toBeNull();
    expect(post.readAttribute("post_title")).not.toBeNull();
  });

  it("reselect", () => {
    const expected = Post.select("title").toSql();
    expect(Post.select("title", "body").reselect("title").toSql()).toBe(expected);
  });

  it("reselect with default scope select", () => {
    const expected = Post.select("title").toSql();
    const actual = PostWithDefaultSelect.reselect("title").toSql();
    expect(actual).toBe(expected);
  });

  it("reselect with hash argument", () => {
    const expected = Post.select("title", { posts: { title: ":post_title" } }).toSql();
    const actual = Post.select("title", "body")
      .reselect("title", { posts: { title: ":post_title" } })
      .toSql();
    expect(actual).toBe(expected);
  });

  it("reselect with one level hash argument", () => {
    const expected = Post.select("title", { title: ":post_title" }).toSql();
    const actual = Post.select("title", "body").reselect("title", { title: ":post_title" }).toSql();
    expect(actual).toBe(expected);
  });

  it("non select columns wont be loaded", async () => {
    const posts = Post.select("UPPER(title) AS title");

    const assertNonSelectColumnsWontBeLoaded = (post: { title: string; body: unknown }) => {
      expect(post.title).toBe("WELCOME TO THE WEBLOG");
      expect(() => post.body).toThrow(MissingAttributeError);
      expect(() => post.body).toThrow(/attribute 'body' for Post/);
    };

    assertNonSelectColumnsWontBeLoaded((await posts.first()) as never);
    assertNonSelectColumnsWontBeLoaded((await posts.preload(":comments").first()) as never);
    assertNonSelectColumnsWontBeLoaded((await posts.eagerLoad(":comments").first()) as never);
  });

  it("merging select from different model", async () => {
    const posts = Post.select("id", "title").joins(":comments");
    const comments = Comment.where({ body: "Thank you for the welcome" });

    for (const post of [
      (await posts.merge(comments.select("body")).first()) as never as Record<string, unknown> & {
        readAttribute(n: string): unknown;
      },
      (await posts.merge(comments.select("comments.body")).first()) as never as Record<
        string,
        unknown
      > & { readAttribute(n: string): unknown },
    ]) {
      expect(Number(post.readAttribute("id"))).toBe(1);
      expect(post.readAttribute("title")).toBe("Welcome to the weblog");
      expect(post.readAttribute("body")).toBe("Thank you for the welcome");
    }
  });

  it("type casted extra select with eager loading", async () => {
    const posts = Post.select("posts.id * 1.1 AS foo").eagerLoad(":comments");
    const post = (await posts.first()) as never as { readAttribute(n: string): unknown };
    const foo = post.readAttribute("foo");
    expect(Number(foo)).toBe(1.1);
    const typeRegistryKey = (Post.connection as unknown as { typeRegistryKey: string })
      .typeRegistryKey;
    const expectsBigDecimal = typeRegistryKey === "postgres" || typeRegistryKey === "mysql2";
    expect(foo instanceof BigDecimal).toBe(expectsBigDecimal);
  });

  it("aliased select using as with joins and includes", async () => {
    const posts = Post.select("posts.id AS field_alias").joins(":comments").includes(":comments");
    const post = (await posts.first()) as never as { attributes: Record<string, unknown> };
    expect(Object.keys(post.attributes)).toEqual(["id", "field_alias"]);
  });

  it("aliased select not using as with joins and includes", async () => {
    const posts = Post.select("posts.id field_alias").joins(":comments").includes(":comments");
    const post = (await posts.first()) as never as { attributes: Record<string, unknown> };
    expect(Object.keys(post.attributes)).toEqual(["id", "field_alias"]);
  });

  it("star select with joins and includes", async () => {
    const posts = Post.select("posts.*").joins(":comments").includes(":comments");
    const post = (await posts.first()) as never as { attributes: Record<string, unknown> };
    expect(Object.keys(post.attributes)).toEqual([
      "id",
      "author_id",
      "title",
      "body",
      "type",
      "legacy_comments_count",
      "taggings_with_delete_all_count",
      "taggings_with_destroy_count",
      "tags_count",
      "indestructible_tags_count",
      "tags_with_destroy_count",
      "tags_with_nullify_count",
    ]);
  });

  it("enumerate columns in select statements", () => {
    const original = (Post as never as { enumerateColumnsInSelectStatements: boolean })
      .enumerateColumnsInSelectStatements;
    try {
      (
        Post as never as { enumerateColumnsInSelectStatements: boolean }
      ).enumerateColumnsInSelectStatements = true;
      const sql = Post.all().toSql();
      for (const columnName of Post.columnNames()) {
        expect(sql).toContain(columnName);
      }
    } finally {
      (
        Post as never as { enumerateColumnsInSelectStatements: boolean }
      ).enumerateColumnsInSelectStatements = original;
    }
  });

  it("select without any arguments", () => {
    expect(() => Post.select()).toThrow("Call `select' with at least one field.");
  });

  it("select with block without any arguments", () => {
    expect(() =>
      (Post.all().select as never as (...a: unknown[]) => unknown)("invalid_argument", () => {}),
    ).toThrow("`select' with block doesn't take arguments.");
  });
});
