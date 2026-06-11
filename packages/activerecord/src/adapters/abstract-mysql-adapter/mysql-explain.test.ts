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

  describe("MysqlExplainTest", () => {
    // mirrors Rails: fixtures :authors, :author_addresses
    describe("fixture-backed", () => {
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
    });

    it("explain for one query", async () => {
      const result = await adapter.explain("SELECT 1");
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

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
