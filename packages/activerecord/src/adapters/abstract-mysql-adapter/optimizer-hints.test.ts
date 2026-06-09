/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/optimizer_hints_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import { describeIfMysql, Mysql2Adapter } from "./test-helper.js";
import { captureSql } from "../../testing/sql-capture.js";
import { Base } from "../../index.js";
import { TEST_SCHEMA as canonicalSchema } from "../../test-helpers/test-schema.js";
import { useHandlerFixtures } from "../../test-helpers/use-handler-fixtures.js";
import { Post } from "../../test-helpers/models/post.js";

describeIfMysql("Mysql2Adapter", () => {
  describe("OptimizerHintsTest", () => {
    // mirrors Rails: fixtures :posts
    useHandlerFixtures(["posts"], { schema: canonicalSchema });

    let adapter: Mysql2Adapter;
    beforeAll(async () => {
      adapter = Base.connection as Mysql2Adapter;
      await adapter.addIndex("posts", ["author_id"], {
        name: "index_posts_on_author_id",
        ifNotExists: true,
      });
    });

    it("optimizer hints", async () => {
      const hint = "NO_RANGE_OPTIMIZATION(posts index_posts_on_author_id)";
      const sqls = await captureSql(async () => {
        await Post.optimizerHints(hint)
          .select("id")
          .where({ author_id: [0, 1] })
          .toArray();
      });
      // Rails: assert_queries_match(%r{\ASELECT /\*\+ NO_RANGE_OPTIMIZATION(...) \*/})
      expect(sqls[0]).toMatch(
        /^SELECT \/\*\+ NO_RANGE_OPTIMIZATION\(posts index_posts_on_author_id\) \*\//,
      );
      // Rails: assert_includes posts.explain.inspect, "| index | index_posts_on_author_id |"
      const plan = await Post.optimizerHints(hint)
        .select("id")
        .where({ author_id: [0, 1] })
        .explain();
      expect(plan).toContain("index_posts_on_author_id");
    });
  });
});
