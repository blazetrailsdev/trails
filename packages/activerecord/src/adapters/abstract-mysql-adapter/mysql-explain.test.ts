/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/mysql_explain_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import { describeIfMysql, Mysql2Adapter } from "./test-helper.js";
import { defineSchema } from "../../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
import { Base } from "../../index.js";

setupHandlerSuite();

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeAll(() => {
    adapter = Base.connection as Mysql2Adapter;
  });

  describe("MysqlExplainTest", () => {
    it("explain for one query", async () => {
      const result = await adapter.explain("SELECT 1");
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it.skip("explain with options as symbol", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in mysql-explain
      // ROOT-CAUSE: adapters/mysql2/mysql-explain.ts or abstract-mysql-adapter/mysql-explain.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/mysql-explain.ts; affects ~10–26 tests in mysql-explain.test.ts
    });
    it.skip("explain with options as strings", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in mysql-explain
      // ROOT-CAUSE: adapters/mysql2/mysql-explain.ts or abstract-mysql-adapter/mysql-explain.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/mysql-explain.ts; affects ~10–26 tests in mysql-explain.test.ts
    });
    it.skip("explain options with eager loading", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in mysql-explain
      // ROOT-CAUSE: adapters/mysql2/mysql-explain.ts or abstract-mysql-adapter/mysql-explain.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/mysql-explain.ts; affects ~10–26 tests in mysql-explain.test.ts
    });

    it("buildExplainClause renders FORMAT=JSON without parens for { format: 'json' }", () => {
      const clause = adapter.buildExplainClause([{ format: "json" }]);
      expect(clause).toBe("EXPLAIN FORMAT=JSON for:");
    });

    it("buildExplainClause combines string flag and format hash space-separated", () => {
      const clause = adapter.buildExplainClause(["analyze", { format: "json" }]);
      expect(clause).toBe("EXPLAIN ANALYZE FORMAT=JSON for:");
    });

    it("buildExplainClause rejects unknown format", () => {
      expect(() => adapter.buildExplainClause([{ format: "bogus" }])).toThrow();
    });

    it("explain executes with { format: 'json' } and returns JSON plan", async () => {
      const result = await adapter.explain("SELECT 1", [], [{ format: "json" }]);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("Relation#explain on MySQL captures the SELECT via sql.active_record", async () => {
      // End-to-end: the full ExplainRegistry → ExplainSubscriber →
      // adapter.explain pipeline only works on MySQL if execute()
      // emits sql.active_record. Without that, Relation#explain
      // silently falls back to toSql() (which keeps Arel's
      // double-quoted identifiers) rather than the payload SQL the
      // driver saw (which goes through `mysqlQuote` → backticks).
      // Asserting backticks is the thing that discriminates the two
      // paths — plain "contains the table name" would pass either
      // way.
      await defineSchema({
        ex_rel_mysqls: { name: "string" },
      });
      class ExRelMysql extends Base {
        static {
          this.attribute("name", "string");
        }
      }
      await ExRelMysql.create({ name: "r" });
      const plan = await ExRelMysql.all().explain();
      expect(typeof plan).toBe("string");
      // The captured SQL came from `payload.sql` (post-mysqlQuote),
      // so it uses backtick-quoted identifiers. The fallback
      // `toSql()` path would emit `"ex_rel_mysqls"` with double
      // quotes instead.
      expect(plan).toContain("`ex_rel_mysqls`");
      expect(plan).not.toMatch(/"ex_rel_mysqls"/);
      // MySQL buildExplainClause header format:
      expect(plan).toMatch(/EXPLAIN.*for:/);
    });

    it("Relation#explain on MySQL captures preload queries", async () => {
      const { registerModel } = await import("../../index.js");
      await defineSchema({
        ex_mysql_authors: { name: "string" },
        ex_mysql_books: { title: "string", ex_mysql_author_id: "integer" },
      });
      class ExMysqlAuthor extends Base {
        static {
          this.attribute("name", "string");
        }
      }
      class ExMysqlBook extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("ex_mysql_author_id", "integer");
        }
      }
      ExMysqlAuthor.hasMany("exMysqlBooks", { className: "ExMysqlBook" });
      registerModel(ExMysqlAuthor);
      registerModel(ExMysqlBook);
      const a = (await ExMysqlAuthor.create({ name: "A" })) as any;
      await ExMysqlBook.create({ title: "B", ex_mysql_author_id: a.id });

      const plan = await ExMysqlAuthor.all().preload("exMysqlBooks").explain();
      const blocks = plan.split("\n\n").filter((b) => /EXPLAIN/.test(b));
      // The fallback path emits exactly one block (toSql() of the
      // outer relation only, no preload query). Requiring ≥ 2
      // blocks proves the preload query was captured through
      // sql.active_record, not substituted from toSql().
      expect(blocks.length).toBeGreaterThanOrEqual(2);
      // Both blocks came from `payload.sql` and therefore carry
      // backtick-quoted identifiers — the fallback form would use
      // double quotes.
      expect(plan).toContain("`ex_mysql_authors`");
      expect(plan).toContain("`ex_mysql_books`");
      expect(plan).not.toMatch(/"ex_mysql_(authors|books)"/);
    });
  });
});
