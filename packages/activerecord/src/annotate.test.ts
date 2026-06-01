/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/annotate_test.rb
 */
import { describe, it, expect } from "vitest";
import "./index.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Post } from "./test-helpers/models/post.js";

describe("AnnotateTest", () => {
  setupHandlerSuite();
  // Mirrors Rails `fixtures :posts` — seed the canonical posts rows so each
  // annotated `select(:id)` relation has data to read back with `.first()`
  // (Rails' `assert posts.first`). `schema` recreates the canonical `posts`
  // table so the shared Post model resolves regardless of any bespoke `posts`
  // a sibling file left in the shared worker DB.
  const { posts } = useHandlerFixtures(["posts"], { schema: canonicalSchema });

  it("annotate wraps content in an inline comment", async () => {
    const relation = Post.select("id").annotate("foo");
    expect(relation.toSql()).toMatch(/SELECT .* FROM .* \/\* foo \*\//);
    expect((await relation.first())?.id).toBe(posts("welcome").id);
  });

  it("annotate is sanitized", async () => {
    // Each annotation is routed through `sanitize_as_sql_comment`, so embedded
    // `*/` / `/*` are spaced apart and can never break out of the wrapping
    // comment. Asserting the exact sanitized output + running `.first()`
    // mirrors Rails' `assert_queries_match` regex + `assert posts.first`.
    const foo = Post.select("id").annotate("*/foo/*");
    expect(foo.toSql()).toContain("/* * /foo/ * */");
    expect((await foo.first())?.id).toBe(posts("welcome").id);

    const slashes = Post.select("id").annotate("**//foo//**");
    expect(slashes.toSql()).toContain("/* ** //foo// ** */");
    expect((await slashes.first())?.id).toBe(posts("welcome").id);

    const spaced = Post.select("id").annotate("* *//foo//* *");
    expect(spaced.toSql()).toContain("/* * * //foo// * * */");
    expect((await spaced.first())?.id).toBe(posts("welcome").id);

    const chained = Post.select("id").annotate("*/foo/*").annotate("*/bar");
    expect(chained.toSql()).toContain("/* * /foo/ * */ /* * /bar */");
    expect((await chained.first())?.id).toBe(posts("welcome").id);

    const hint = Post.select("id").annotate("+ MAX_EXECUTION_TIME(1)");
    expect(hint.toSql()).toContain("/* + MAX_EXECUTION_TIME(1) */");
    expect((await hint.first())?.id).toBe(posts("welcome").id);
  });
});
