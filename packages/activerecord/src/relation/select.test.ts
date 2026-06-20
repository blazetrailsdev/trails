/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/relation/select_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import "../index.js";
import { StatementInvalid } from "../index.js";
import { MissingAttributeError } from "@blazetrails/activemodel";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Post, PostWithDefaultSelect } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { registerModel } from "../associations.js";
import { quoteTableName, escapeRegExp } from "../test-helpers/quote-regex.js";

registerModel(Post);
registerModel(Comment);

const sym = (name: string) => Symbol(name) as unknown as string;

// ==========================================================================
// SelectTest — targets relation/select_test.rb
// ==========================================================================
describe("SelectTest", () => {
  // `useHandlerFixtures` wires `setupHandlerSuite` internally. Mirrors Rails
  // `fixtures :posts, :comments`; the canonical `welcome` post
  // ("Welcome to the weblog") drives the `UPPER(title)` assertions and its
  // `greetings` comment ("Thank you for the welcome") drives the merge tests.
  //
  // The four `not exists` / `invalid nested field` tests deliberately issue a
  // SELECT against a non-existent column. On PostgreSQL that aborts the
  // surrounding transaction ("current transaction is aborted…"), which would
  // poison the shared transactional-fixtures rollback at teardown. They read no
  // fixture rows (only assert `to_sql` + that the query raises), so they opt out
  // of the wrapping transaction via `usesTransaction` and run in autocommit —
  // the failed statement then errors cleanly without leaving an aborted txn.
  useHandlerFixtures(["posts", "comments"], {
    schema: canonicalSchema,
    usesTransaction: [
      "select with not exists field",
      "select with hash with not exists field",
      "select with hash array value with not exists field",
      "select with invalid nested field",
    ],
  });
  // Shield against the shared-worker `posts` collision: sibling files that
  // physically replace `posts` with a title-only shape survive into this suite
  // because the canonical preload keeps signatures cache-warm (a plain
  // defineSchema is a no-op). `dropExisting` rebuilds `posts`/`comments` from
  // the canonical schema verbatim so fixture seeding finds the `body` column.
  beforeAll(async () => {
    await defineSchema(
      { posts: canonicalSchema.posts, comments: canonicalSchema.comments },
      { dropExisting: true },
    );
  });
  const q = (name: string) => escapeRegExp(quoteTableName(name));

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
    expect(Post.select("1", "foo()", sym("bar")).toSql()).toMatch(expected);
  });

  it("select with non field hash values", () => {
    const expected = new RegExp(
      `^SELECT 1 AS ${q("a")}, foo\\(\\) AS ${q("b")}, ${q("bar")} AS ${q("c")} FROM`,
    );
    expect(
      Post.select({ "1": sym("a"), "foo()": sym("b"), [sym("bar")]: sym("c") } as never).toSql(),
    ).toMatch(expected);
  });

  it("select with hash argument", async () => {
    const post = (await Post.select({
      "UPPER(title)": sym("title"),
      posts: { title: sym("post_title") },
    }).first()) as never as { title: string; readAttribute(n: string): unknown };

    expect(post.title).toBe("WELCOME TO THE WEBLOG");
    expect(post.readAttribute("post_title")).toBe("Welcome to the weblog");
  });

  it("select with reserved words aliases", async () => {
    const post = (await Post.select({
      "UPPER(title)": sym("from"),
      title: sym("group"),
    }).first()) as never as { readAttribute(n: string): unknown };

    expect(post.readAttribute("from")).toBe("WELCOME TO THE WEBLOG");
    expect(post.readAttribute("group")).toBe("Welcome to the weblog");
  });

  it("select with one level hash argument", async () => {
    const post = (await Post.select({
      "UPPER(title)": sym("title"),
      title: sym("post_title"),
    }).first()) as never as { title: string; readAttribute(n: string): unknown };

    expect(post.title).toBe("WELCOME TO THE WEBLOG");
    expect(post.readAttribute("post_title")).toBe("Welcome to the weblog");
  });

  it("select with not exists field", async () => {
    const expected = new RegExp(`^SELECT ${q("foo")} AS ${q("post_title")} FROM`);
    expect(Post.select({ [sym("foo")]: sym("post_title") } as never).toSql()).toMatch(expected);

    // Rails guards the raise with `skip if sqlite3_adapter_strict_strings_disabled?`
    // (select_test.rb:53). That guard only matters when the SQLite adapter is
    // configured with `strict: false`, which makes a double-quoted unknown
    // identifier (`"foo"`) parse as a string literal instead of raising. Our
    // SQLite test adapter always runs with DQS off, so `"foo"` always errors;
    // PG/MySQL raise too. The guard condition is therefore always false here.
    await expect(Post.select({ [sym("foo")]: sym("post_title") } as never).take()).rejects.toThrow(
      StatementInvalid,
    );
  });

  it("select with hash with not exists field", async () => {
    const expected = new RegExp(`^SELECT ${q("posts.bar")} AS ${q("post_title")} FROM`);
    expect(Post.select({ posts: { bar: sym("post_title") } }).toSql()).toMatch(expected);

    await expect(Post.select({ posts: { boo: sym("post_title") } }).take()).rejects.toThrow(
      StatementInvalid,
    );
  });

  it("select with hash array value with not exists field", async () => {
    const expected = new RegExp(`^SELECT ${q("posts.bar")}, ${q("posts.id")} FROM`);
    expect(Post.select({ posts: [sym("bar"), sym("id")] }).toSql()).toMatch(expected);

    await expect(Post.select({ posts: [sym("bar"), sym("id")] }).take()).rejects.toThrow(
      StatementInvalid,
    );
  });

  it("select with hash and table alias", async () => {
    const post = (await Post.joins("comments", "commentsWithExtend")
      .select("title", {
        posts: { title: sym("post_title") },
        comments: { body: sym("comment_body") },
        commentsWithExtend: { body: sym("comment_body_2") },
      } as never)
      .take()) as never as { title: string; readAttribute(n: string): unknown };

    expect(post.readAttribute("post_title")).toBe(post.title);
    expect(post.readAttribute("comment_body")).not.toBeNull();
    expect(post.readAttribute("comment_body_2")).not.toBeNull();
  });

  it("select with invalid nested field", async () => {
    await expect(
      Post.select({ posts: { "UPPER(title)": sym("post_title") } }).take(),
    ).rejects.toThrow(StatementInvalid);
    await expect(Post.select({ posts: ["UPPER(title)"] }).take()).rejects.toThrow(StatementInvalid);
  });

  it("select with hash argument without aliases", async () => {
    const post = (await Post.select({
      posts: [sym("title"), "title as post_title"],
    }).first()) as never as { title: string; readAttribute(n: string): unknown };

    expect(post.title).toBe("Welcome to the weblog");
    expect(post.readAttribute("post_title")).toBe("Welcome to the weblog");
  });

  it("select with hash argument with few tables", async () => {
    const post = (await Post.joins("comments")
      .select("title", {
        posts: { title: sym("post_title") },
        comments: { body: sym("comment_body") },
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
    const expected = Post.select("title", { posts: { title: sym("post_title") } }).toSql();
    const actual = Post.select("title", "body")
      .reselect("title", { posts: { title: sym("post_title") } })
      .toSql();
    expect(actual).toBe(expected);
  });

  it("reselect with one level hash argument", () => {
    const expected = Post.select("title", { title: sym("post_title") }).toSql();
    const actual = Post.select("title", "body")
      .reselect("title", { title: sym("post_title") })
      .toSql();
    expect(actual).toBe(expected);
  });

  it("non select columns wont be loaded", async () => {
    const posts = Post.select("UPPER(title) AS title");

    const assertNonSelectColumnsWontBeLoaded = (post: { title: string; body: unknown }) => {
      expect(post.title).toBe("WELCOME TO THE WEBLOG");
      // Rails: assert_raise(ActiveModel::MissingAttributeError, match: /attribute 'body' for Post/)
      expect(() => post.body).toThrow(MissingAttributeError);
      expect(() => post.body).toThrow(/attribute 'body' for Post/);
    };

    assertNonSelectColumnsWontBeLoaded((await posts.first()) as never);
    assertNonSelectColumnsWontBeLoaded((await posts.preload("comments").first()) as never);
    assertNonSelectColumnsWontBeLoaded((await posts.eagerLoad("comments").first()) as never);
  });

  it("merging select from different model", async () => {
    const posts = Post.select("id", "title").joins("comments");
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
      expect(post.readAttribute("id")).toBe(1);
      expect(post.readAttribute("title")).toBe("Welcome to the weblog");
      expect(post.readAttribute("body")).toBe("Thank you for the welcome");
    }
  });

  it("type casted extra select with eager loading", async () => {
    // Rails reads the aliased extra select via `posts.first.foo`; trails exposes
    // query-only aliases through `readAttribute` (no dynamic accessor is
    // generated for non-schema columns), matching the sibling hash-select tests.
    const posts = Post.select("posts.id * 1.1 AS foo").eagerLoad("comments");
    const post = (await posts.first()) as never as { readAttribute(n: string): unknown };
    // The explicit extra select is preserved through the JoinDependency and
    // hydrated onto the base record, type-cast via the result set's column_types
    // (mirrors Rails' JoinDependency#instantiate slicing `result_set.column_types`).
    // Rails asserts `assert_equal 1.1, posts.first.foo`, which is numeric
    // equality: SQLite yields a native Float, while PG (`numeric`) and MySQL
    // (`NEWDECIMAL`) yield a BigDecimal — and Ruby's `BigDecimal == Float` is
    // true. JS has no cross-type `===` for BigDecimal vs number, so we assert the
    // same numeric equality (the value is now a typed numeric, not the raw "1.1"
    // string it was before extra-select columns were cast by column type).
    expect(Number(post.readAttribute("foo"))).toBe(1.1);
  });

  it("aliased select using as with joins and includes", async () => {
    const posts = Post.select("posts.id AS field_alias").joins("comments").includes("comments");
    const post = (await posts.first()) as never as { attributes: Record<string, unknown> };
    expect(Object.keys(post.attributes)).toEqual(["id", "field_alias"]);
  });

  it("aliased select not using as with joins and includes", async () => {
    const posts = Post.select("posts.id field_alias").joins("comments").includes("comments");
    const post = (await posts.first()) as never as { attributes: Record<string, unknown> };
    expect(Object.keys(post.attributes)).toEqual(["id", "field_alias"]);
  });

  it("star select with joins and includes", async () => {
    const posts = Post.select("posts.*").joins("comments").includes("comments");
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
    // In Ruby, `Post.select("arg") { }` passes both a column arg and a block;
    // in TS the closest equivalent is passing a string and a function together.
    expect(() =>
      (Post.all().select as never as (...a: unknown[]) => unknown)("invalid_argument", () => {}),
    ).toThrow("`select' with block doesn't take arguments.");
  });
});
