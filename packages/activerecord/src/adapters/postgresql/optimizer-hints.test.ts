import { it, expect, beforeAll } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { describeIfSupports } from "../../support/supports.js";
import { Base } from "../../index.js";
import { fixtures } from "../../test-helpers/use-fixtures.js";
import { Post } from "../../test-helpers/models/post.js";

describeIfPg("PostgreSQLAdapter", () => {
  describeIfSupports("optimizer_hints", "PostgresqlOptimizerHintsTest", () => {
    const { self } = fixtures(["authors", "posts"]);

    beforeAll(async () => {
      await ((await Base.leaseConnection()) as PostgreSQLAdapter).enableExtension("pg_hint_plan");
    });

    it("optimizer hints", async () => {
      await self().assertQueriesMatch(/^SELECT \/\*\+ SeqScan\(posts\) \*\//, {}, async () => {
        const posts = Post.optimizerHints("SeqScan(posts)")
          .select("id")
          .where({ author_id: [0, 1] });
        const plan = await posts.explain().inspect();
        expect(plan).toContain("Seq Scan on posts");
      });
    });

    it("optimizer hints with count subquery", async () => {
      await self().assertQueriesMatch(/^SELECT \/\*\+ SeqScan\(posts\) \*\//, {}, async () => {
        const count = await Post.optimizerHints("SeqScan(posts)")
          .select("id")
          .where({ author_id: [0, 1] })
          .limit(5)
          .count();
        expect(count).toBe(5);
      });
    });

    it("optimizer hints is sanitized", async () => {
      await self().assertQueriesMatch(/^SELECT \/\*\+ SeqScan\(posts\) \*\//, {}, async () => {
        const posts = Post.optimizerHints("/*+ SeqScan(posts) */")
          .select("id")
          .where({ author_id: [0, 1] });
        const plan = await posts.explain().inspect();
        expect(plan).toContain("Seq Scan on posts");
      });

      await self().assertQueriesMatch(
        /^SELECT \/\*\+ \*\* \/\/ "posts"\.\*, \/\/ \*\* \*\//,
        {},
        async () => {
          const posts = Post.optimizerHints('**// "posts".*, //**')
            .select("id")
            .where({ author_id: [0, 1] });
          const first = await posts.first();
          expect((first as any).readAttribute("id")).toBe(1);
        },
      );
    });

    it("optimizer hints with unscope", async () => {
      await self().assertQueriesMatch(/^SELECT "posts"\."id"/, {}, async () => {
        await Post.optimizerHints("/*+ SeqScan(posts) */")
          .select("id")
          .where({ author_id: [0, 1] })
          .unscope(":optimizerHints")
          .load();
      });
    });

    it("optimizer hints with or", async () => {
      await self().assertQueriesMatch(/^SELECT \/\*\+ SeqScan\(posts\) \*\//, {}, async () => {
        await Post.optimizerHints("SeqScan(posts)").or(Post.all()).load();
      });

      let queries = await self().captureSql({ includeSchema: false }, async () => {
        await Post.optimizerHints("SeqScan(posts)")
          .or(Post.optimizerHints("IndexScan(posts)"))
          .load();
      });
      expect(queries.length).toBe(1);
      expect(queries[0]).toContain("/*+ SeqScan(posts) */");
      expect(queries[0]).not.toContain("/*+ IndexScan(posts) */");

      queries = await self().captureSql({ includeSchema: false }, async () => {
        await Post.all().or(Post.optimizerHints("IndexScan(posts)")).load();
      });
      expect(queries.length).toBe(1);
      expect(queries[0]).not.toContain("/*+ IndexScan(posts) */");
    });
  });
});
