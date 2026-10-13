import { describe, it, expect, beforeAll } from "vitest";
import { describeIfMysqlAdapter, isMariaDb, Mysql2Adapter } from "./test-helper.js";
import { fixtures } from "../../test-helpers/use-fixtures.js";
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
    adapter = (await Base.leaseConnection()) as Mysql2Adapter;
    await adapter.getDatabaseVersion();
  });

  describe("MySQLExplainTest", () => {
    const { authors } = fixtures(["authors", "authorAddresses", "posts"], {
      useTransactionalTests: true,
    });

    it("Relation#explain on MySQL captures the SELECT via sql.active_record", async () => {
      const plan = await Author.where({ id: authors("david").id })
        .explain()
        .inspect();
      expect(plan).toContain("`authors`");
      expect(plan).not.toMatch(/"authors"/);
      expect(plan).toMatch(/EXPLAIN SELECT/);
    });

    it("Relation#explain on MySQL re-executes an already-loaded relation", async () => {
      const relation = Author.where({ id: authors("david").id });
      await relation;
      const plan = await relation.explain().inspect();
      expect(plan).toContain("`authors`");
      expect(plan).not.toMatch(/"authors"/);
      expect(plan).toMatch(/EXPLAIN SELECT/);
    });

    it("Relation#explain on MySQL captures preload queries", async () => {
      const plan = await Author.where({ id: authors("david").id })
        .preload(":posts")
        .explain()
        .inspect();
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

    it("buildExplainClause drops a Symbol option's leading colon", async () => {
      const clause = await adapter.buildExplainClause([":analyze"]);
      const analyzeWithoutExplain =
        isMariaDb && (await adapter.databaseVersion).compare("10.1.0") >= 0;
      expect(clause).toBe(analyzeWithoutExplain ? "ANALYZE" : "EXPLAIN ANALYZE");
    });

    it("explain executes with a format flag and returns JSON plan", async () => {
      const result = await adapter.explain("SELECT 1", [], ["format=json"]);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
