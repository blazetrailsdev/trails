/**
 * A Relation passed as a positional or named bind to `where` must be inlined
 * as a subquery, matching Rails' `build_bound_sql_literal` (query_methods.rb):
 * Arel nodes render to SQL and other `to_sql`-responding values pass through as
 * Arel literals rather than reaching the bind quoter. Trails-surfaced deviation
 * traced in PR #3598; the canonical `Topic` model carries `approved` exactly as
 * Rails' `topics` fixtures do.
 */
import { describe, it, expect } from "vitest";
import "../index.js";
import { registerModel } from "../index.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Topic } from "../test-helpers/models/topic.js";

registerModel(Topic);

const sortedIds = (rows: Array<{ id: unknown }>) =>
  rows.map((r) => Number(r.id)).sort((a, b) => a - b);

describe("bound SQL literal with Relation bind value", () => {
  useHandlerFixtures(["topics"], { schema: canonicalSchema });

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
});
