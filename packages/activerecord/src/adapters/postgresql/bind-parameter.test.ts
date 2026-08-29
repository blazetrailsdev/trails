import { describe, it, expect } from "vitest";
import { describeIfPg } from "./test-helper.js";
import { BigDecimal } from "@blazetrails/activesupport";
import { fixtures } from "../../test-fixtures.js";
import { Post } from "../../test-helpers/models/post.js";

describeIfPg("PostgreSQLAdapter", () => {
  describe("BindParameterTest", () => {
    fixtures(["authors", "posts"]);

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
      await assertQuotedAs("0", 0.0);
    });

    it("where with boolean for string column using bind parameters", async () => {
      await assertQuotedAs("FALSE", false);
    });

    it("where with decimal for string column using bind parameters", async () => {
      await assertQuotedAs("0.0", new BigDecimal(0));
    });

    it("where with rational for string column using bind parameters", async () => {
      await assertQuotedAs("0", 0);
    });
  });
});
