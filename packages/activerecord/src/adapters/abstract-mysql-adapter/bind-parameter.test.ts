import { describe, it, expect } from "vitest";
import { BigDecimal } from "@blazetrails/activesupport";
import { Rational } from "@blazetrails/date";
import { describeIfMysqlAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Post } from "../../test-helpers/models/post.js";
import { Topic } from "../../test-helpers/models/topic.js";

describeIfMysqlAdapter("AbstractMysqlAdapter", () => {
  describe("BindParameterTest", () => {
    fixtures(["topics", "posts"]);

    async function assertQuotedAs(expected: string, value: unknown, match = 0) {
      const relation = Post.where("title = ?", value);
      expect(relation.toSql()).toBe(
        `SELECT \`posts\`.* FROM \`posts\` WHERE (title = ${expected})`,
      );
      if (match === 0) {
        expect(await relation).toHaveLength(0);
      } else {
        expect(await relation.count()).toBe(match);
      }
    }

    it("update question marks", async () => {
      const str = "foo?bar";
      const x = (await Topic.first())!;
      x.title = str;
      x.content = str;
      await x.saveBang();
      await x.reload();
      expect(x.title).toBe(str);
      expect(x.content).toBe(str);
    });

    it("create question marks", async () => {
      const str = "foo?bar";
      const x = await Topic.createBang({ title: str, content: str });
      await x.reload();
      expect(x.title).toBe(str);
      expect(x.content).toBe(str);
    });

    it("update null bytes", async () => {
      const str = "foo\0bar";
      const x = (await Topic.first())!;
      x.title = str;
      x.content = str;
      await x.saveBang();
      await x.reload();
      expect(x.title).toBe(str);
      expect(x.content).toBe(str);
    });

    it("create null bytes", async () => {
      const str = "foo\0bar";
      const x = await Topic.createBang({ title: str, content: str });
      await x.reload();
      expect(x.title).toBe(str);
      expect(x.content).toBe(str);
    });

    it("where with string for string column using bind parameters", async () => {
      await assertQuotedAs("'Welcome to the weblog'", "Welcome to the weblog", 1);
    });

    it("where with integer for string column using bind parameters", async () => {
      await assertQuotedAs("'0'", 0);
    });

    it("where with float for string column using bind parameters", async () => {
      await assertQuotedAs("'0'", 0.0);
    });

    it("where with boolean for string column using bind parameters", async () => {
      await assertQuotedAs("'0'", false);
    });

    it("where with decimal for string column using bind parameters", async () => {
      await assertQuotedAs("'0.0'", new BigDecimal(0));
    });

    it("where with rational for string column using bind parameters", async () => {
      await assertQuotedAs("'0.0'", new Rational(0, 1));
    });
  });
});
