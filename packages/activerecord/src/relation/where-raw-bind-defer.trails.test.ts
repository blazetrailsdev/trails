/**
 * trails-specific regression guard (no Rails counterpart): `Relation#where` /
 * `whereNot` / `whereAny` / `having` hand hash values RAW to PredicateBuilder,
 * like Rails' build_where_clause (query_methods.rb) — the QueryAttribute bind
 * owns casting/serialization at compile time (predicate_builder.rb:57-69 →
 * build_bind_attribute → value_for_database). An earlier trails invention
 * (`Relation#_castWhereValue`, removed by RFC 0067) eagerly pre-cast string
 * values up front; these tests pin the deferred-bind behavior on every entry
 * point that used it, for the un-castable inputs the pre-cast used to mangle:
 * an un-castable string must serialize to NULL in the bind (`col = NULL` /
 * `IN (NULL)`, matches nothing) — never route onto the explicit-nil
 * `IS NULL` / `IS NOT NULL` path (matches nulls).
 */
import { describe, it, expect } from "vitest";
import "../index.js";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Topic } from "../test-helpers/models/topic.js";

registerModel(Topic);

describe("where value defer-to-bind casting", () => {
  const { topics } = fixtures(["topics"]);

  it("whereNot with an un-castable string binds it instead of IS NOT NULL", async () => {
    const first = topics("first");
    await first.update({ parent_id: 0 });
    const rel = Topic.whereNot({ parent_id: "not-a-number" });
    expect(rel.toSql()).not.toMatch(/IS NOT NULL/i);
    // `parent_id != NULL` matches nothing — including rows whose parent_id IS NULL.
    expect(await rel).toHaveLength(0);
  });

  it("whereAny with an un-castable string binds it instead of IS NULL", async () => {
    const rel = Topic.all().whereAny({ parent_id: "not-a-number" }, { written_on: "" });
    expect(rel.toSql()).not.toMatch(/IS NULL/i);
    expect(await rel).toHaveLength(0);
  });

  it("having with an un-castable string binds it instead of IS NULL", async () => {
    // Select only the grouped column — PG rejects an ungrouped `topics.*`.
    const rel = Topic.select("parent_id").group("parent_id").having({ parent_id: "not-a-number" });
    expect(rel.toSql()).not.toMatch(/IS NULL/i);
    expect(await rel).toHaveLength(0);
  });

  it("non-string scalars for a numeric column take the same bind path as strings", async () => {
    // The retired pre-cast only touched `typeof value === "string"`; a raw
    // number and its string spelling must compile to the same predicate shape.
    const numeric = Topic.where({ parent_id: 1 }).toSql();
    const stringy = Topic.where({ parent_id: "1" }).toSql();
    expect(stringy).toBe(numeric);
  });
});
