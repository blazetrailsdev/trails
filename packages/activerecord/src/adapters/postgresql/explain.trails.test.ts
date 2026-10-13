import { it, expect, beforeAll, afterAll } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base, registerModel } from "../../index.js";

fixtures([]);

describeIfPg("PostgresqlExplainTest (trails)", () => {
  let adapter: PostgreSQLAdapter;
  beforeAll(async () => {
    adapter = (await Base.leaseConnection()) as PostgreSQLAdapter;
  });
  afterAll(async () => {
    await adapter.execute(`DROP TABLE IF EXISTS ex_relations, ex_authors, ex_books CASCADE`);
  });

  it("Relation#explain on PG captures the SELECT via sql.active_record", async () => {
    class ExRelation extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    await adapter.execute(`CREATE TABLE "ex_relations" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
    await ExRelation.create({ name: "r" });
    const plan = await ExRelation.all().explain().inspect();
    expect(typeof plan).toBe("string");
    expect(plan.toLowerCase()).toContain("select");
    expect(plan).toContain("ex_relations");
    expect(plan).toMatch(/^EXPLAIN SELECT/m);
  });

  it("Relation#explain on PG captures preload queries", async () => {
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
    await adapter.execute(`CREATE TABLE "ex_authors" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
    await adapter.execute(
      `CREATE TABLE "ex_books" ("id" SERIAL PRIMARY KEY, "title" TEXT, "ex_author_id" INTEGER)`,
    );
    const a = await ExAuthor.create({ name: "A" });
    await ExBook.create({ title: "B", ex_author_id: a.id });

    const plan = await ExAuthor.all().preload(":exBooks").explain().inspect();
    const blocks = plan.split("\n\n").filter((b) => /EXPLAIN/.test(b));
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(plan).toContain("ex_authors");
    expect(plan).toContain("ex_books");
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
});
