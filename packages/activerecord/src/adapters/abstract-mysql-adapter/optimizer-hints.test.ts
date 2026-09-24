import { it, expect, beforeAll } from "vitest";
import { asJson } from "@blazetrails/activesupport";
import { describeIfMysqlAdapter, Mysql2Adapter } from "./test-helper.js";
import { describeIfSupports } from "../../support/supports.js";
import { assertQueriesMatch } from "../../testing/query-assertions.js";
import { captureSql } from "../../testing/sql-capture.js";
import { Base } from "../../index.js";
import { fixtures } from "../../test-fixtures.js";
import { Post } from "../../test-helpers/models/post.js";

describeIfMysqlAdapter("Mysql2Adapter", () => {
  describeIfSupports("optimizer_hints", "OptimizerHintsTest", () => {
    fixtures(["posts"]);

    let adapter: Mysql2Adapter;
    beforeAll(async () => {
      adapter = (await Base.leaseConnection()) as Mysql2Adapter;
      await adapter.addIndex("posts", ["author_id"], {
        name: "index_posts_on_author_id",
        ifNotExists: true,
      });
    });

    it("optimizer hints", async () => {
      await assertQueriesMatch(
        /^SELECT \/\*\+ NO_RANGE_OPTIMIZATION\(posts index_posts_on_author_id\) \*\//,
        undefined,
        false,
        async () => {
          let posts = Post.optimizerHints("NO_RANGE_OPTIMIZATION(posts index_posts_on_author_id)");
          posts = posts.select("id").where({ author_id: [0, 1] });
          expect(await posts.explain()).toContain(
            "| index | index_posts_on_author_id | index_posts_on_author_id |",
          );
        },
      );
    });

    it("optimizer hints with count subquery", async () => {
      await assertQueriesMatch(
        /^SELECT \/\*\+ NO_RANGE_OPTIMIZATION\(posts index_posts_on_author_id\) \*\//,
        undefined,
        false,
        async () => {
          let posts = Post.optimizerHints("NO_RANGE_OPTIMIZATION(posts index_posts_on_author_id)");
          posts = posts
            .select("id")
            .where({ author_id: [0, 1] })
            .limit(5);
          expect(await posts.count()).toBe(5);
        },
      );
    });

    it("optimizer hints is sanitized", async () => {
      await assertQueriesMatch(
        /^SELECT \/\*\+ NO_RANGE_OPTIMIZATION\(posts index_posts_on_author_id\) \*\//,
        undefined,
        false,
        async () => {
          let posts = Post.optimizerHints(
            "/*+ NO_RANGE_OPTIMIZATION(posts index_posts_on_author_id) */",
          );
          posts = posts.select("id").where({ author_id: [0, 1] });
          expect(await posts.explain()).toContain(
            "| index | index_posts_on_author_id | index_posts_on_author_id |",
          );
        },
      );

      await assertQueriesMatch(
        /^SELECT \/\*\+ \*\* \/\/ `posts`\.\*, \/\/ \*\* \*\//,
        undefined,
        false,
        async () => {
          let posts = Post.optimizerHints("**// `posts`.*, //**");
          posts = posts.select("id").where({ author_id: [0, 1] });
          expect(asJson(await posts.first())).toEqual({ id: 1 });
        },
      );
    });

    it("optimizer hints with unscope", async () => {
      await assertQueriesMatch(/^SELECT `posts`\.`id`/, undefined, false, async () => {
        let posts = Post.optimizerHints(
          "/*+ NO_RANGE_OPTIMIZATION(posts index_posts_on_author_id) */",
        );
        posts = posts.select("id").where({ author_id: [0, 1] });
        await posts.unscope("optimizerHints").load();
      });
    });

    it("optimizer hints with or", async () => {
      await assertQueriesMatch(
        /^SELECT \/\*\+ NO_RANGE_OPTIMIZATION\(posts index_posts_on_author_id\) \*\//,
        undefined,
        false,
        async () => {
          await Post.optimizerHints("NO_RANGE_OPTIMIZATION(posts index_posts_on_author_id)")
            .or(Post.all())
            .load();
        },
      );

      let queries = await captureSql(async () => {
        await Post.optimizerHints("NO_RANGE_OPTIMIZATION(posts index_posts_on_author_id)")
          .or(Post.optimizerHints("NO_ICP(posts)"))
          .load();
      });
      expect(queries.length).toBe(1);
      expect(queries[0]).toContain("NO_RANGE_OPTIMIZATION(posts index_posts_on_author_id)");
      expect(queries[0]).not.toContain("NO_ICP(posts)");

      queries = await captureSql(async () => {
        await Post.all().or(Post.optimizerHints("NO_ICP(posts)")).load();
      });
      expect(queries.length).toBe(1);
      expect(queries[0]).not.toContain("NO_ICP(posts)");
    });
  });
});
