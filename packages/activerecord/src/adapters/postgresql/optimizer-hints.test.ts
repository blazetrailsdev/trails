/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/optimizer_hints_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import { describeIfPg, pgSupportsOptimizerHints, PostgreSQLAdapter } from "./test-helper.js";
import { assertQueriesMatch } from "../../testing/query-assertions.js";
import { captureSql } from "../../testing/sql-capture.js";
import { Base } from "../../index.js";
import { TEST_SCHEMA as canonicalSchema } from "../../test-helpers/test-schema.js";
import { useHandlerFixtures } from "../../test-helpers/use-handler-fixtures.js";
import { Post } from "../../test-helpers/models/post.js";

// Rails wraps the whole PostgresqlOptimizerHintsTest body in
// `if supports_optimizer_hints?` (true only when the pg_hint_plan extension is
// installed), so the examples never run on a server that lacks it. Mirror that
// with a conditional describe.
const describeOptimizerHints = pgSupportsOptimizerHints ? describe : describe.skip;

describeIfPg("PostgreSQLAdapter", () => {
  describeOptimizerHints("PostgresqlOptimizerHintsTest", () => {
    // Mirrors Rails' `fixtures :posts`. Rails' posts.yml uses literal
    // `author_id: 1` (David); our ported posts fixture references the author by
    // label, so authors must be declared first for that ref to resolve to
    // David's id (1) rather than the label-hash fallback.
    useHandlerFixtures(["authors", "posts"], { schema: canonicalSchema });

    beforeAll(async () => {
      // Mirrors Rails setup: enable_extension!("pg_hint_plan")
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
          // `explain` runs the underlying SELECT (emitting the hinted query the
          // regex matches) and then EXPLAINs it — mirrors Rails calling
          // `posts.explain` inside the assert_queries_match block.
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

      // Rails' upstream regex expects the pre-CVE strip; the current
      // `sanitize_as_sql_comment` neutralizes delimiters by spacing (`**//` → `** //`).
      // This example never re-runs in Rails CI (needs pg_hint_plan), so that regex
      // went stale — we assert the faithful output (no `*/`/`/*` escapes the comment).
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
