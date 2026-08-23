/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/annotate_test.rb
 */
import { describe, it, expect } from "vitest";
import "./index.js";
import { fixtures } from "./test-fixtures.js";
import { Post } from "./test-helpers/models/post.js";
import { assertQueriesMatch } from "./testing/query-assertions.js";

describe("AnnotateTest", () => {
  // `fixtures` wires the handler suite internally, so no separate call.
  // Mirrors Rails `fixtures :posts` — seed the canonical posts rows so each
  // annotated `select(:id)` relation has data to read back with `.first()`
  // (Rails' `assert posts.first`). The canonical `posts` table comes from the
  // template clone.
  fixtures(["posts"]);

  it("annotate wraps content in an inline comment", async () => {
    await assertQueriesMatch(/SELECT .* FROM .* \/\* foo \*\//i, undefined, false, async () => {
      const relation = Post.select("id").annotate("foo");
      expect(await relation.first()).toBeTruthy();
    });
  });

  it("annotate is sanitized", async () => {
    await assertQueriesMatch(
      /SELECT .* FROM .* \/\* \* \/foo\/ \* \*\//i,
      undefined,
      false,
      async () => {
        const relation = Post.select("id").annotate("*/foo/*");
        expect(await relation.first()).toBeTruthy();
      },
    );

    await assertQueriesMatch(
      /SELECT .* FROM .* \/\* \*\* \/\/foo\/\/ \*\* \*\//i,
      undefined,
      false,
      async () => {
        const relation = Post.select("id").annotate("**//foo//**");
        expect(await relation.first()).toBeTruthy();
      },
    );

    await assertQueriesMatch(
      /SELECT .* FROM .* \/\* \* \* \/\/foo\/\/ \* \* \*\//i,
      undefined,
      false,
      async () => {
        const relation = Post.select("id").annotate("* *//foo//* *");
        expect(await relation.first()).toBeTruthy();
      },
    );

    await assertQueriesMatch(
      /SELECT .* FROM .* \/\* \* \/foo\/ \* \*\/ \/\* \* \/bar \*\//i,
      undefined,
      false,
      async () => {
        const relation = Post.select("id").annotate("*/foo/*").annotate("*/bar");
        expect(await relation.first()).toBeTruthy();
      },
    );

    await assertQueriesMatch(
      /SELECT .* FROM .* \/\* \+ MAX_EXECUTION_TIME\(1\) \*\//i,
      undefined,
      false,
      async () => {
        const relation = Post.select("id").annotate("+ MAX_EXECUTION_TIME(1)");
        expect(await relation.first()).toBeTruthy();
      },
    );
  });
});
