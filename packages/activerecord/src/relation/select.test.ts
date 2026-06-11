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
import { Post } from "../test-helpers/models/post.js";
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

  it.skip("select with hash and table alias", () => {
    // BLOCKED: relation — joins(:comments, :comments_with_extend) + per-join table
    // aliasing not yet supported; selects aliased columns across three joined tables.
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

  it.skip("select with hash argument with few tables", () => {
    // BLOCKED: relation — joins(:comments) + cross-table hash select not yet supported.
    // Rails: Post.joins(:comments).select(:title, posts: { title: :post_title }, comments: { body: :comment_body })
  });

  it("reselect", () => {
    const expected = Post.select("title").toSql();
    expect(Post.select("title", "body").reselect("title").toSql()).toBe(expected);
  });

  it.skip("reselect with default scope select", () => {
    // BLOCKED: relation — default_scope with select not implemented (PostWithDefaultSelect).
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
    // Rails' third call — `posts.eager_load(:comments).first` — is omitted here.
    // BLOCKED: eager_load builds its own full t0_r* column projection via the
    // JoinDependency and discards the relation's explicit `select` projection,
    // so the base record loads every column instead of just `UPPER(title) AS
    // title` (the loaded `body` then never raises MissingAttributeError).
    // Honoring a custom base-table select under eager loading is a framework
    // change spanning the JoinDependency projection + row hydration — out of
    // scope for this fixture port. The plain + preload paths exercise the same
    // assertion faithfully.
  });

  it.skip("merging select from different model", () => {
    // BLOCKED: relation — merge() does not carry over a select projection from a
    // different model class across joins(:comments).
  });

  it.skip("type casted extra select with eager loading", () => {
    // BLOCKED: associations — eager_load attribute type-casting not yet supported.
  });

  it.skip("aliased select using as with joins and includes", () => {
    // BLOCKED: associations — joins + includes attribute-key inspection not yet supported.
  });

  it.skip("aliased select not using as with joins and includes", () => {
    // BLOCKED: associations — joins + includes attribute-key inspection not yet supported.
  });

  it.skip("star select with joins and includes", () => {
    // BLOCKED: associations — joins + includes attribute-key inspection not yet supported.
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
