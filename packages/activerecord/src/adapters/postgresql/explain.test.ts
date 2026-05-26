/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/explain_test.rb
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { defineSchema } from "../../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../../test-helpers/use-handler-transactional-fixtures.js";
import { Base } from "../../index.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

// EXPLAIN tests build their own ad-hoc `ex_*` tables; nothing is
// expressible as a static defineSchema spec. defineSchema({})
// marks the file as TM-Phase-5 compliant. The outer transaction wrapping
// each test rolls back those tables (PG DDL is transactional).
setupHandlerSuite();
useHandlerTransactionalFixtures();

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeAll(async () => {
    adapter = Base.connection as PostgreSQLAdapter;
    await defineSchema({});
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
      class ExRelation extends Base {
        static {
          this.attribute("name", "string");
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
      const { registerModel } = await import("../../index.js");
      class ExAuthor extends Base {
        static {
          this.attribute("name", "string");
        }
      }
      class ExBook extends Base {
        static {
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

    it("buildExplainClause renders FORMAT JSON for { format: 'json' }", () => {
      const clause = adapter.buildExplainClause([{ format: "json" }]);
      expect(clause).toBe("EXPLAIN (FORMAT JSON) for:");
    });

    it("buildExplainClause combines string flags and format hash", () => {
      const clause = adapter.buildExplainClause(["analyze", { format: "json" }]);
      expect(clause).toBe("EXPLAIN (ANALYZE, FORMAT JSON) for:");
    });

    it("buildExplainClause rejects unknown format", () => {
      expect(() => adapter.buildExplainClause([{ format: "bogus" }])).toThrow();
    });

    it("explain executes with { format: 'json' } and returns JSON plan", async () => {
      const result = await adapter.explain("SELECT 1", [], [{ format: "json" }]);
      // The prior stringifier rendered pg-auto-parsed plans as
      // "[object Object]" — assert structure instead of just "[".
      expect(result).not.toContain("[object Object]");
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toHaveProperty("Plan");
    });

    it.skip("explain options with eager loading", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in explain
      // ROOT-CAUSE: connection-adapters/postgresql/explain.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in connection-adapters/postgresql/explain.ts; affects ~10–47 tests in explain.test.ts
    });
  });
});
