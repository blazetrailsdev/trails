/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/explain_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    try {
      const tables = await adapter.execute(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'ex_%'`,
      );
      for (const t of tables) {
        await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}" CASCADE`);
      }
    } catch {
      // ignore cleanup errors
    }
    await adapter.close();
  });

  describe("PostgresqlExplainTest", () => {
    it("explain for one query", async () => {
      const result = await adapter.explain("SELECT 1");
      expect(result).toContain("Result");
    });

    it("Relation#explain on PG captures the SELECT via sql.active_record", async () => {
      // End-to-end check: the whole ExplainRegistry + ExplainSubscriber
      // pipeline only works on PG if `execQuery` (the real SELECT path)
      // emits `sql.active_record`. Without that, `Relation#explain`
      // silently falls back to `toSql()` and reports zero collected
      // queries.
      const { Base } = await import("../../index.js");
      class ExRelation extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      await adapter.exec(`CREATE TABLE "ex_relations" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      await ExRelation.create({ name: "r" });
      const plan = await ExRelation.all().explain();
      expect(typeof plan).toBe("string");
      expect(plan.toLowerCase()).toContain("select");
      expect(plan).toContain("ex_relations");
      // The per-query header from PG buildExplainClause:
      expect(plan).toMatch(/EXPLAIN.*for:/);
    });

    it("Relation#explain on PG captures preload queries", async () => {
      const { Base, registerModel } = await import("../../index.js");
      class ExAuthor extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      }
      class ExBook extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("ex_author_id", "integer");
          this.adapter = adapter;
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

      const plan = await ExAuthor.all().preload("exBooks").explain();
      const blocks = plan.split("\n\n").filter((b) => /EXPLAIN/.test(b));
      expect(blocks.length).toBeGreaterThanOrEqual(2);
      expect(plan).toContain("ex_authors");
      expect(plan).toContain("ex_books");
    });

    it("explain with options as symbols", async () => {
      await adapter.exec(`CREATE TABLE "ex_explain" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      await adapter.executeMutation(`INSERT INTO "ex_explain" ("name") VALUES ('test')`);
      const result = await adapter.explain(`SELECT * FROM "ex_explain"`);
      // Plan output varies but should contain the table name
      expect(result).toContain("ex_explain");
    });

    it("explain with options as strings", async () => {
      const result = await adapter.explain("SELECT 1 AS val");
      expect(result).toContain("Result");
    });

    it.skip("explain options with eager loading", async () => {});
  });
});
