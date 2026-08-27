import { it, expect, beforeAll } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { describeIfSupports } from "../../support/supports.js";
import { assertQueriesMatch } from "../../testing/query-assertions.js";
import { captureSql } from "../../testing/sql-capture.js";
import { Base } from "../../index.js";
import { fixtures } from "../../test-fixtures.js";
import { Post } from "../../test-helpers/models/post.js";

describeIfPg("PostgreSQLAdapter", () => {
  describeIfSupports("optimizer_hints", "PostgresqlOptimizerHintsTest", () => {
    fixtures(["authors", "posts"]);

    beforeAll(async () => {
      await (Base.connection as PostgreSQLAdapter).enableExtension("pg_hint_plan");
    });

    it("optimizer hints", async () => {
      await assertQueriesMatch(
        /^SELECT \/\*\+ SeqScan\(posts\) \*\//,
        undefined,
        false,
        async () => {
          const posts = Post.optimizerHints("SeqScan(posts)")
            .select("id")
            .where({ author_id: [0, 1] });
          const plan = await posts.explain();
          expect(plan).toContain("Seq Scan on posts");
        },
      );
    });

    it("optimizer hints with count subquery", async () => {
      await assertQueriesMatch(
        /^SELECT \/\*\+ SeqScan\(posts\) \*\//,
        undefined,
        false,
        async () => {
          const count = await Post.optimizerHints("SeqScan(posts)")
            .select("id")
            .where({ author_id: [0, 1] })
            .limit(5)
            .count();
          expect(count).toBe(5);
        },
      );
    });

    it("optimizer hints is sanitized", async () => {
      await assertQueriesMatch(
        /^SELECT \/\*\+ SeqScan\(posts\) \*\//,
        undefined,
        false,
        async () => {
          const posts = Post.optimizerHints("/*+ SeqScan(posts) */")
            .select("id")
            .where({ author_id: [0, 1] });
          const plan = await posts.explain();
          expect(plan).toContain("Seq Scan on posts");
        },
      );

      await assertQueriesMatch(
        /^SELECT \/\*\+ \*\* \/\/ "posts"\.\*, \/\/ \*\* \*\//,
        undefined,
        false,
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
      await assertQueriesMatch(/^SELECT "posts"\."id"/, undefined, false, async () => {
        await Post.optimizerHints("/*+ SeqScan(posts) */")
          .select("id")
          .where({ author_id: [0, 1] })
          .unscope("optimizerHints")
          .load();
      });
    });

    it("optimizer hints with or", async () => {
      await assertQueriesMatch(
        /^SELECT \/\*\+ SeqScan\(posts\) \*\//,
        undefined,
        false,
        async () => {
          await Post.optimizerHints("SeqScan(posts)").or(Post.all()).load();
        },
      );

      let queries = await captureSql(
        async () => {
          await Post.optimizerHints("SeqScan(posts)")
            .or(Post.optimizerHints("IndexScan(posts)"))
            .load();
        },
        { includeSchema: false },
      );
      expect(queries.length).toBe(1);
      expect(queries[0]).toContain("/*+ SeqScan(posts) */");
      expect(queries[0]).not.toContain("/*+ IndexScan(posts) */");

      queries = await captureSql(
        async () => {
          await Post.all().or(Post.optimizerHints("IndexScan(posts)")).load();
        },
        { includeSchema: false },
      );
      expect(queries.length).toBe(1);
      expect(queries[0]).not.toContain("/*+ IndexScan(posts) */");
    });
  });
});
