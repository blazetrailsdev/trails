/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/bind_parameter_test.rb
 */
import { describe, it, expect } from "vitest";
import { describeIfPg } from "./test-helper.js";
import { TEST_SCHEMA as canonicalSchema } from "../../test-helpers/test-schema.js";
import { useHandlerFixtures } from "../../test-helpers/use-handler-fixtures.js";
import { Post } from "../../test-helpers/models/post.js";

describeIfPg("PostgreSQLAdapter", () => {
  describe("BindParameterTest", () => {
    // Mirrors Rails' `fixtures :posts`. Authors are declared first so the posts
    // fixture's author label-ref resolves to David's id (matching Rails posts.yml).
    useHandlerFixtures(["authors", "posts"], { schema: canonicalSchema });

    // Mirrors Rails' private `assert_quoted_as(expected, value, match: 0)`:
    // Post.where("title = ?", value) inlines `value` into the displayed SQL with
    // the PG adapter's quoting (`to_sql` parity), while at execution the `?` is
    // bound as a parameter so PG casts the value against the varchar `title`
    // column. A type-mismatched value (integer/float/boolean/decimal/rational)
    // therefore returns no rows rather than raising 42883. Like Rails, the
    // `match == 0` branch asserts `to_a` is empty and the matching branch
    // asserts `count`.
    async function assertQuotedAs(expected: string, value: unknown, match = 0) {
      const relation = Post.where("title = ?", value);
      expect(relation.toSql()).toBe(`SELECT "posts".* FROM "posts" WHERE (title = ${expected})`);
      if (match === 0) {
        expect(await relation.toArray()).toHaveLength(0);
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
      await assertQuotedAs("FALSE", false);
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
  });
});
