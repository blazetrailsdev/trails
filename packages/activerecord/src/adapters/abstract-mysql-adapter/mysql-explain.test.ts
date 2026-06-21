/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/mysql_explain_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import { describeIfMysql, isMariaDb, Mysql2Adapter } from "./test-helper.js";
import { Version } from "../../connection-adapters/abstract-adapter.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
import { Base } from "../../index.js";
import { TEST_SCHEMA as canonicalSchema } from "../../test-helpers/test-schema.js";
import { useHandlerFixtures } from "../../test-helpers/use-handler-fixtures.js";
import { Author } from "../../test-helpers/models/author.js";
import { Post } from "../../test-helpers/models/post.js";
import { registerModel } from "../../index.js";

setupHandlerSuite();

describeIfMysql("Mysql2Adapter", () => {
  registerModel(Author);
  registerModel(Post);

  let adapter: Mysql2Adapter;
  beforeAll(async () => {
    adapter = Base.connection as Mysql2Adapter;
    await adapter.getDatabaseVersion();
  });

  describe("MySQLExplainTest", () => {
    // mirrors Rails: fixtures :authors, :author_addresses
    const { authors } = useHandlerFixtures(["authors", "authorAddresses", "posts"], {
      schema: canonicalSchema,
    });

    // Mirror Rails' explain_option / expected_analyze_clause split exactly:
    //   supports_analyze?         = mariadb && version >= 10.1.0       → "ANALYZE"
    //   supports_explain_analyze? = mariadb ? version <= 10.0          → "EXPLAIN ANALYZE"
    //                                       : version >= 6.0
    //   else                                                          → "EXPLAIN EXTENDED"
    // explain_option picks :analyze when either holds, else :extended.
    // MariaDB >= 10.1 prints a bare ANALYZE clause (no EXPLAIN prefix).
    let explainOpt: string;
    let expectedClause: string;
    beforeAll(() => {
      const ver = adapter.databaseVersion;
      const supportsAnalyze = isMariaDb && ver.gte("10.1.0");
      // `version <= "10.0"` expressed as `Version("10.0") >= version`.
      const supportsExplainAnalyze = isMariaDb ? new Version("10.0").gte(ver) : ver.gte("6.0");
      explainOpt = supportsAnalyze || supportsExplainAnalyze ? "analyze" : "extended";
      expectedClause = supportsAnalyze
        ? "ANALYZE"
        : supportsExplainAnalyze
          ? "EXPLAIN ANALYZE"
          : "EXPLAIN EXTENDED";
    });

    it("explain with options as symbol", async () => {
      // Rails: Author.where(id: 1).explain(explain_option)
      const result = await Author.where({ id: authors("david").id }).explain(explainOpt);
      // Our header appends " for:" where Rails prints a bare clause.
      expect(result).toContain(`${expectedClause} for:`);
      expect(result).toContain("SELECT `authors`");
    });

    it("explain with options as strings", async () => {
      // Rails: Author.where(id: 1).explain(explain_option.to_s.upcase) — uppercase string
      const result = await Author.where({ id: authors("david").id }).explain(
        explainOpt.toUpperCase(),
      );
      expect(result).toContain(`${expectedClause} for:`);
      expect(result).toContain("SELECT `authors`");
    });

    it("explain options with eager loading", async () => {
      // Rails: Author.where(id: 1).includes(:posts).explain(explain_option)
      const result = await Author.where({ id: authors("david").id })
        .includes("posts")
        .explain(explainOpt);
      expect(result).toContain(`${expectedClause} for:`);
      const blocks = result.split("\n\n").filter((b) => /EXPLAIN|ANALYZE/.test(b));
      expect(blocks.length).toBeGreaterThanOrEqual(2);
    });

    it("explain for one query", async () => {
      const result = await adapter.explain("SELECT 1");
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    // trails-only: the ExplainRegistry → ExplainSubscriber → adapter.explain
    // pipeline only works on MySQL if execute() emits sql.active_record.
    // Without that, Relation#explain silently falls back to toSql() (which
    // keeps Arel's double-quoted identifiers) rather than the payload SQL the
    // driver saw (post-`mysqlQuote` → backticks). Asserting backticks (and the
    // absence of double quotes) is what discriminates the two paths; a plain
    // "contains the table name" assertion would pass either way. Uses the
    // canonical authors/posts fixtures rather than a bespoke table.
    it("Relation#explain on MySQL captures the SELECT via sql.active_record", async () => {
      const plan = await Author.where({ id: authors("david").id }).explain();
      expect(plan).toContain("`authors`");
      expect(plan).not.toMatch(/"authors"/);
      expect(plan).toMatch(/EXPLAIN.*for:/);
    });

    // trails-only regression: an already-loaded relation must still re-execute
    // through the always-executing exec_queries path (Rails
    // `collecting_queries_for_explain { exec_queries }`), capturing the real
    // backtick-quoted SQL via sql.active_record — NOT short-circuit on the load
    // cache and fall back to `_toSql()`'s double-quoted identifiers (which MySQL
    // reads as a string literal). Loading first, then asserting backticks (and
    // the absence of double quotes), proves the capture path was used.
    it("Relation#explain on MySQL re-executes an already-loaded relation", async () => {
      const relation = Author.where({ id: authors("david").id });
      await relation.toArray(); // prime the load cache
      const plan = await relation.explain();
      expect(plan).toContain("`authors`");
      expect(plan).not.toMatch(/"authors"/);
      expect(plan).toMatch(/EXPLAIN.*for:/);
    });

    it("Relation#explain on MySQL captures preload queries", async () => {
      const plan = await Author.where({ id: authors("david").id })
        .preload("posts")
        .explain();
      const blocks = plan.split("\n\n").filter((b) => /EXPLAIN/.test(b));
      // The fallback path emits exactly one block (toSql() of the outer
      // relation only, no preload query). Requiring ≥ 2 blocks proves the
      // preload query was captured through sql.active_record, not substituted
      // from toSql(). Both blocks carry backtick-quoted identifiers.
      expect(blocks.length).toBeGreaterThanOrEqual(2);
      expect(plan).toContain("`authors`");
      expect(plan).toContain("`posts`");
      expect(plan).not.toMatch(/"(authors|posts)"/);
    });
  });

  // TS-only coverage of our buildExplainClause/Relation#explain plumbing. Not
  // Rails tests — kept in a sibling block so test:compare doesn't read them as
  // members of the MySQLExplainTest class. These exercise the adapter directly
  // (no DB rows), so they need no fixtures.
  describe("explain helpers (trails-only)", () => {
    it("buildExplainClause renders FORMAT=JSON without parens for { format: 'json' }", () => {
      const clause = adapter.buildExplainClause([{ format: "json" }]);
      expect(clause).toBe("EXPLAIN FORMAT=JSON for:");
    });

    it("buildExplainClause combines string flag and format hash space-separated", () => {
      const clause = adapter.buildExplainClause(["analyze", { format: "json" }]);
      // MariaDB >= 10.1 drops the EXPLAIN prefix for ANALYZE (analyze_without_explain?).
      const analyzeWithoutExplain = isMariaDb && adapter.databaseVersion.gte("10.1.0");
      expect(clause).toBe(
        analyzeWithoutExplain ? "ANALYZE FORMAT=JSON for:" : "EXPLAIN ANALYZE FORMAT=JSON for:",
      );
    });

    it("buildExplainClause rejects unknown format", () => {
      expect(() => adapter.buildExplainClause([{ format: "bogus" }])).toThrow();
    });

    it("explain executes with { format: 'json' } and returns JSON plan", async () => {
      const result = await adapter.explain("SELECT 1", [], [{ format: "json" }]);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
