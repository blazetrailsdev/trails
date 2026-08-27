import { describe, it, expect } from "vitest";
import "./index.js";
import { fixtures } from "./test-fixtures.js";
import { Post } from "./test-helpers/models/post.js";
import { assertQueriesMatch } from "./testing/query-assertions.js";

describe("AnnotateTest", () => {
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
