/**
 * A Relation passed as a positional or named bind to `where` must be inlined
 * as a subquery, matching Rails' `build_bound_sql_literal` (query_methods.rb):
 * Arel nodes render to SQL and other `to_sql`-responding values pass through as
 * Arel literals rather than reaching the bind quoter. Trails-surfaced deviation
 * traced in PR #3598; the canonical `Topic` model carries `approved` exactly as
 * Rails' `topics` fixtures do.
 */
import { describe, it, expect } from "vitest";
import { Nodes } from "@blazetrails/arel";
import "../index.js";
import { registerModel } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Topic } from "../test-helpers/models/topic.js";

registerModel(Topic);

const sortedIds = (rows: Array<{ id: unknown }>) =>
  rows.map((r) => Number(r.id)).sort((a, b) => a - b);

// The builders are private instance methods on Relation (relation.ts wrappers
// that delegate to the query-methods module fns); reach them through this shape.
type BoundSqlLiteralBuilders = {
  buildBoundSqlLiteral(statement: string, values: unknown[]): Nodes.BoundSqlLiteral;
  buildNamedBoundSqlLiteral(
    statement: string,
    values: Record<string, unknown>,
  ): Nodes.BoundSqlLiteral;
};

describe("bound SQL literal with Relation bind value", () => {
  fixtures(["topics"], { schema: canonicalSchema });

  it("inlines a Relation positional bind as an IN subquery", async () => {
    const approved = Topic.where({ approved: true });
    const approvedIds = Topic.where({ approved: true }).select("id");
    const relation = Topic.where("id IN (?)", approvedIds);

    expect(relation.toSql()).toContain("IN (SELECT");

    const expected = sortedIds(await approved.toArray());
    expect(sortedIds(await relation.toArray())).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0);
  });

  it("inlines a Relation named bind as an IN subquery", async () => {
    const approved = Topic.where({ approved: true });
    const approvedIds = Topic.where({ approved: true }).select("id");
    const relation = Topic.where("id IN (:ids)", { ids: approvedIds });

    expect(relation.toSql()).toContain("IN (SELECT");

    const expected = sortedIds(await approved.toArray());
    expect(sortedIds(await relation.toArray())).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0);
  });

  it("extracts id_for_database from an AR object positional bind", async () => {
    const [first] = sortedIds(await Topic.where({ approved: true }));
    const topic = await Topic.find(first);
    const relation = Topic.where("id = ?", topic);

    // build_bound_sql_literal reduces the model to its id_for_database
    // (query_methods.rb:1707-1709) before the value reaches the quoter.
    expect(relation.toSql()).toContain(String(first));
    const rows = await relation.toArray();
    expect(rows.map((r) => Number(r.id))).toEqual([first]);
  });

  it("maps id_for_database over an array positional bind", async () => {
    const ids = sortedIds(await Topic.where({ approved: true }));
    const topics = await Topic.where({ approved: true });
    const relation = Topic.where("id IN (?)", topics);

    expect(sortedIds(await relation.toArray())).toEqual(ids);
    expect(ids.length).toBeGreaterThan(0);
  });

  // Direct coverage for the builders that `buildWhereClause` now routes string
  // fragments through (see `build_where_clause`, query_methods.rb:1625-1627);
  // call them here so the Relation→`Arel.sql(toSql)` branch has a focused
  // regression guard independent of the full `where(...)` path.
  it("buildBoundSqlLiteral inlines a Relation positional bind as a SqlLiteral", () => {
    const approvedIds = Topic.where({ approved: true }).select("id");
    const builders = Topic.all() as unknown as BoundSqlLiteralBuilders;
    const node = builders.buildBoundSqlLiteral("id IN (?)", [approvedIds]);

    const bind = node.positionalBinds[0];
    expect(bind).toBeInstanceOf(Nodes.SqlLiteral);
    expect((bind as Nodes.SqlLiteral).value).toContain("SELECT");
  });

  it("buildNamedBoundSqlLiteral inlines a Relation named bind as a SqlLiteral", () => {
    const approvedIds = Topic.where({ approved: true }).select("id");
    const builders = Topic.all() as unknown as BoundSqlLiteralBuilders;
    const node = builders.buildNamedBoundSqlLiteral("id IN (:ids)", { ids: approvedIds });

    const bind = node.namedBinds.ids;
    expect(bind).toBeInstanceOf(Nodes.SqlLiteral);
    expect((bind as Nodes.SqlLiteral).value).toContain("SELECT");
  });
});
