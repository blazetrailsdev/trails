import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base } from "../../index.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

fixtures([]);

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeAll(async () => {
    adapter = Base.connection as PostgreSQLAdapter;
  });
  afterAll(async () => {
    await adapter.exec(
      `DROP TABLE IF EXISTS ex_relations, ex_authors, ex_books, ex_explain, op_authors, op_posts CASCADE`,
    );
  });
  describe("PostgresqlExplainTest", () => {
    it("explain for one query", async () => {
      const result = await adapter.explain("SELECT 1");
      expect(result).toContain("Result");
    });

    it("Relation#explain on PG captures the SELECT via sql.active_record", async () => {
      class ExRelation extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
        }
      }
      await adapter.exec(`CREATE TABLE "ex_relations" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      await ExRelation.create({ name: "r" });
      const plan = await ExRelation.all().explain();
      expect(typeof plan).toBe("string");
      expect(plan.toLowerCase()).toContain("select");
      expect(plan).toContain("ex_relations");
      expect(plan).toMatch(/^EXPLAIN SELECT/m);
    });

    it("Relation#explain on PG captures preload queries", async () => {
      const { registerModel } = await import("../../index.js");
      class ExAuthor extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
        }
      }
      class ExBook extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("title", "string");
          this.attribute("ex_author_id", "integer");
        }
      }
      ExAuthor.hasMany("exBooks", { className: "ExBook" });
      registerModel(ExAuthor);
      registerModel(ExBook);
      await adapter.exec(`CREATE TABLE "ex_authors" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      await adapter.exec(
        `CREATE TABLE "ex_books" ("id" SERIAL PRIMARY KEY, "title" TEXT, "ex_author_id" INTEGER)`,
      );
      const a = (await ExAuthor.create({ name: "A" })) as any;
      await ExBook.create({ title: "B", ex_author_id: a.id });

      const plan = await ExAuthor.all().preload(":exBooks").explain();
      const blocks = plan.split("\n\n").filter((b) => /EXPLAIN/.test(b));
      expect(blocks.length).toBeGreaterThanOrEqual(2);
      expect(plan).toContain("ex_authors");
      expect(plan).toContain("ex_books");
    });

    it("explain with options as symbols", async () => {
      await adapter.exec(`CREATE TABLE "ex_explain" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      await adapter.executeMutation(`INSERT INTO "ex_explain" ("name") VALUES ('test')`);
      const result = await adapter.explain(`SELECT * FROM "ex_explain"`);
      expect(result).toContain("ex_explain");
    });

    it("explain with options as strings", async () => {
      const result = await adapter.explain("SELECT 1 AS val");
      expect(result).toContain("Result");
    });

    it("buildExplainClause renders FORMAT JSON", async () => {
      const clause = await adapter.buildExplainClause(["FORMAT JSON"]);
      expect(clause).toBe("EXPLAIN (FORMAT JSON)");
    });

    it("buildExplainClause combines string flags and format", async () => {
      const clause = await adapter.buildExplainClause(["analyze", "format json"]);
      expect(clause).toBe("EXPLAIN (ANALYZE, FORMAT JSON)");
    });

    it("explain executes with FORMAT JSON and returns JSON plan", async () => {
      const result = await adapter.explain("SELECT 1", [], ["FORMAT JSON"]);
      expect(result).not.toContain("[object Object]");
      expect(result).toContain("QUERY PLAN");
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      expect(jsonMatch).not.toBeNull();
      const parsed = JSON.parse(jsonMatch![0].replace(/^ /gm, "")) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0] as Record<string, unknown>).toHaveProperty("Plan");
    });

    it("explain options with eager loading", async () => {
      const { registerModel } = await import("../../index.js");
      class OpAuthor extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("name", "string");
        }
      }
      class OpPost extends Base {
        static {
          this.attribute("id", "integer");
          this.attribute("title", "string");
          this.attribute("op_author_id", "integer");
        }
      }
      OpAuthor.hasMany("opPosts", { className: "OpPost" });
      registerModel(OpAuthor);
      registerModel(OpPost);
      await adapter.exec(`CREATE TABLE "op_authors" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      await adapter.exec(
        `CREATE TABLE "op_posts" ("id" SERIAL PRIMARY KEY, "title" TEXT, "op_author_id" INTEGER)`,
      );
      const author = (await OpAuthor.create({ name: "A" })) as any;
      await OpPost.create({ title: "B", op_author_id: author.id });

      const plan = await OpAuthor.where({ id: author.id }).includes(":opPosts").explain("analyze");
      expect(plan).toContain("QUERY PLAN");
      expect(plan).toMatch(/EXPLAIN \(ANALYZE\)/);
      const analyzeBlocks = plan.split("\n\n").filter((b) => /EXPLAIN \(ANALYZE\)/.test(b));
      expect(analyzeBlocks.length).toBeGreaterThanOrEqual(2);
      expect(plan).toContain("op_authors");
      expect(plan).toContain("op_posts");
    });
  });
});
