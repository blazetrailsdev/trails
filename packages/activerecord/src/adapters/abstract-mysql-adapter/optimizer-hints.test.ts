import { it, expect, beforeAll } from "vitest";
import { describeIfMysqlAdapter, Mysql2Adapter } from "./test-helper.js";
import { describeIfSupports } from "../../support/supports.js";
import { assertQueriesMatch } from "../../testing/query-assertions.js";
import { Base } from "../../index.js";
import { fixtures } from "../../test-fixtures.js";
import { Post } from "../../test-helpers/models/post.js";

describeIfMysqlAdapter("Mysql2Adapter", () => {
  describeIfSupports("optimizer_hints", "OptimizerHintsTest", () => {
    fixtures(["posts"]);

    let adapter: Mysql2Adapter;
    beforeAll(async () => {
      adapter = Base.connection as Mysql2Adapter;
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
  });
});
