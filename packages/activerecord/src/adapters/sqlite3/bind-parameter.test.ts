/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/bind_parameter_test.rb
 */
import { describe, it, expect } from "vitest";
import { describeIfSqlite } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { BigDecimal } from "@blazetrails/activesupport";
import { Post } from "../../test-helpers/models/post.js";

describeIfSqlite("SQLite3Adapter", () => {
  describe("BindParameterTest", () => {
    fixtures(["posts"]);

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
      // Tracked deviation pending convergence, RFC 0082
      // `rational-value-quoting-analogue`: Rails passes `0.0` and expects the
      // literal `0.0`, but JS has a single `Number` type, so `0.0 === 0` and the
      // adapter renders `0`. That story decides whether a Float analogue is
      // warranted or the limitation is terminal.
      await assertQuotedAs("0", 0.0);
    });

    it("where with boolean for string column using bind parameters", async () => {
      await assertQuotedAs("0", false);
    });

    it("where with decimal for string column using bind parameters", async () => {
      await assertQuotedAs("0.0", new BigDecimal(0));
    });

    it("where with rational for string column using bind parameters", async () => {
      // Tracked deviation pending convergence, RFC 0082
      // `rational-value-quoting-analogue`: Rails passes `Rational(0)` and
      // expects `0/1`, but trails has no `Rational` analogue yet, so the nearest
      // value is a plain `Number` — which makes this case duplicate the integer
      // one above until that story ports the class (as `BigDecimal` already is).
      await assertQuotedAs("0", 0);
    });
  });
});
