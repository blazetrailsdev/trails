import { describe, it, expect, beforeAll } from "vitest";
import { describeIfMysqlAdapter, isMariaDb, Mysql2Adapter } from "./test-helper.js";
import { Version } from "../../connection-adapters/abstract-adapter.js";
import { fixtures } from "../../test-fixtures.js";
import { Base } from "../../index.js";
import { Author } from "../../test-helpers/models/author.js";
import { Post } from "../../test-helpers/models/post.js";
import { registerModel } from "../../index.js";

fixtures({}, { useTransactionalTests: false });

describeIfMysqlAdapter("Mysql2Adapter", () => {
  registerModel(Author);
  registerModel(Post);

  let adapter: Mysql2Adapter;
  beforeAll(async () => {
    adapter = Base.connection as Mysql2Adapter;
    await adapter.getDatabaseVersion();
  });

  describe("MySQLExplainTest", () => {
    const { authors } = fixtures(["authors", "authorAddresses", "posts"]);

    let explainOpt: string;
    let expectedClause: string;
    beforeAll(async () => {
      const ver = await adapter.databaseVersion;
      const supportsAnalyze = isMariaDb && ver.compare("10.1.0") >= 0;
      const supportsExplainAnalyze = isMariaDb
        ? new Version("10.0").compare(String(ver)) >= 0
        : ver.compare("6.0") >= 0;
      explainOpt = supportsAnalyze || supportsExplainAnalyze ? "analyze" : "extended";
      expectedClause = supportsAnalyze
        ? "ANALYZE"
        : supportsExplainAnalyze
          ? "EXPLAIN ANALYZE"
          : "EXPLAIN EXTENDED";
    });

    it("explain with options as symbol", async () => {
      const result = await Author.where({ id: authors("david").id }).explain(explainOpt);
      expect(result).toContain(expectedClause);
      expect(result).toContain("SELECT `authors`");
    });

    it("explain with options as strings", async () => {
      const result = await Author.where({ id: authors("david").id }).explain(
        explainOpt.toUpperCase(),
      );
      expect(result).toContain(expectedClause);
      expect(result).toContain("SELECT `authors`");
    });

    it("explain options with eager loading", async () => {
      const result = await Author.where({ id: authors("david").id })
        .includes(":posts")
        .explain(explainOpt);
      expect(result).toContain(expectedClause);
      const blocks = result.split("\n\n").filter((b) => /EXPLAIN|ANALYZE/.test(b));
      expect(blocks.length).toBeGreaterThanOrEqual(2);
    });

    it("explain for one query", async () => {
      const result = await adapter.explain("SELECT 1");
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("Relation#explain on MySQL captures the SELECT via sql.active_record", async () => {
      const plan = await Author.where({ id: authors("david").id }).explain();
      expect(plan).toContain("`authors`");
      expect(plan).not.toMatch(/"authors"/);
      expect(plan).toMatch(/EXPLAIN SELECT/);
    });

    it("Relation#explain on MySQL re-executes an already-loaded relation", async () => {
      const relation = Author.where({ id: authors("david").id });
      await relation;
      const plan = await relation.explain();
      expect(plan).toContain("`authors`");
      expect(plan).not.toMatch(/"authors"/);
      expect(plan).toMatch(/EXPLAIN SELECT/);
    });

    it("Relation#explain on MySQL captures preload queries", async () => {
      const plan = await Author.where({ id: authors("david").id })
        .preload(":posts")
        .explain();
      const blocks = plan.split("\n\n").filter((b) => /EXPLAIN/.test(b));
      expect(blocks.length).toBeGreaterThanOrEqual(2);
      expect(plan).toContain("`authors`");
      expect(plan).toContain("`posts`");
      expect(plan).not.toMatch(/"(authors|posts)"/);
    });
  });

  describe("explain helpers (trails-only)", () => {
    it("buildExplainClause renders a format flag without parens", async () => {
      const clause = await adapter.buildExplainClause(["format=json"]);
      expect(clause).toBe("EXPLAIN FORMAT=JSON");
    });

    it("buildExplainClause joins its flags space-separated", async () => {
      const clause = await adapter.buildExplainClause(["analyze", "format=json"]);
      const analyzeWithoutExplain =
        isMariaDb && (await adapter.databaseVersion).compare("10.1.0") >= 0;
      expect(clause).toBe(
        analyzeWithoutExplain ? "ANALYZE FORMAT=JSON" : "EXPLAIN ANALYZE FORMAT=JSON",
      );
    });

    it("explain executes with a format flag and returns JSON plan", async () => {
      const result = await adapter.explain("SELECT 1", [], ["format=json"]);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
