/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/bind_parameter_test.rb
 */
import { describe, it, expect } from "vitest";
import { describeIfSqlite } from "./test-helper.js";
import { fixtures } from "../../test-helpers/fixtures.js";
import { Post } from "../../test-helpers/models/post.js";

describeIfSqlite("SQLite3Adapter", () => {
  describe("BindParameterTest", () => {
    // Mirrors Rails' `fixtures :posts`. Authors are declared first so the posts
    // fixture's author label-ref resolves to David's id (matching Rails posts.yml).
    fixtures(["authors", "posts"]);

    // Mirrors Rails' private `assert_quoted_as(expected, value, match: 0)`: the
    // point of the suite is how each value type renders into the bind position
    // of `Post.where("title = ?", value)`, so the assertion is on `toSql()`.
    // Like Rails, the `match == 0` branch asserts `to_a` is empty and the
    // matching branch asserts `count`.
    async function assertQuotedAs(expected: string, value: unknown, match = 0) {
      const relation = Post.where("title = ?", value);
      expect(relation.toSql()).toBe(`SELECT "posts".* FROM "posts" WHERE (title = ${expected})`);
      if (match === 0) {
        expect(await relation).toHaveLength(0);
      } else {
        expect(await relation.count()).toBe(match);
      }
    }

    it("where with string for string column using bind parameters", async () => {
      await assertQuotedAs("'Welcome to the weblog'", "Welcome to the weblog", 1);
    });

    it("where with integer for string column using bind parameters", async () => {
      await assertQuotedAs("0", 0);
    });

    it("where with float for string column using bind parameters", async () => {
      // Rails passes `0.0` and expects the literal `0.0`. JS has a single
      // `Number` type, so `0.0 === 0` and the adapter renders `0` — there is no
      // distinct float literal to reproduce Ruby's `0.0`.
      await assertQuotedAs("0", 0.0);
    });

    it("where with boolean for string column using bind parameters", async () => {
      await assertQuotedAs("0", false);
    });

    it("where with decimal for string column using bind parameters", async () => {
      // Rails passes `BigDecimal(0)` and expects `0.0`. JS has no BigDecimal;
      // the nearest value is a plain `Number`, which the adapter renders `0`.
      await assertQuotedAs("0", 0);
    });

    it("where with rational for string column using bind parameters", async () => {
      // Rails passes `Rational(0)` and expects `0/1`. JS has no Rational type;
      // the nearest value is a plain `Number`, which the adapter renders `0`.
      await assertQuotedAs("0", 0);
    });
  }); // BindParameterTest
});
