/**
 * `Relation#toSql` renders the eager JOIN and the primary-key restriction for a
 * composite-PK relation with LIMIT/OFFSET over collection reflections.
 *
 * Rails' `to_sql` is
 * `apply_join_dependency { |relation, jd| jd.apply_column_aliases(relation).to_sql }`
 * (relation.rb:1210-1222), and `apply_join_dependency` runs
 * `distinct_relation_for_primary_key` unconditionally — including for a
 * composite key, where it rewrites the relation as
 * `where!(**Array(primary_key).zip(limited_ids.transpose).to_h)`, a per-column
 * `IN` (schema_statements.rb:1448).
 *
 * trails' `toSql` is synchronous, so it cannot execute the limited-ids query and
 * nests the DISTINCT-pk query inline instead — per column, keeping Rails' shape.
 * `_buildEagerOperandManager` used to answer `null` for this case, so `toSql`
 * rendered the plain arel: no JOIN, no pk restriction at all — SQL that does not
 * describe the query that would actually run.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { CpkOrder, CpkBook } from "../test-helpers/models/cpk.js";
import type { Base } from "../index.js";

describe("Relation#to_sql composite-PK eager load with limit", () => {
  fixtures(["cpkOrders", "cpkBooks"]);

  beforeAll(() => {
    [CpkOrder, CpkBook].forEach((m) => registerModel(m as unknown as typeof Base));
  });

  it("renders the eager JOIN and a per-column primary-key restriction", () => {
    const sql = CpkOrder.eagerLoad(":books").limit(1).toSql();

    expect(sql).toMatch(/LEFT OUTER JOIN/i);
    expect(sql).toContain("cpk_books");
    // One inline DISTINCT subquery per primary-key column — Rails' per-column
    // `IN`, not a tuple `IN`. Identifier quoting differs per adapter, so assert
    // on the unquoted column names and the subquery count.
    expect((sql.match(/IN \(SELECT DISTINCT/gi) ?? []).length).toBe(2);
    expect(sql).toContain("shop_id");
    expect(sql).toMatch(/LIMIT/i);
  });

  it("renders the same restriction for offset without limit", () => {
    const sql = CpkOrder.eagerLoad(":books").offset(2).toSql();

    expect(sql).toMatch(/LEFT OUTER JOIN/i);
    expect((sql.match(/IN \(SELECT DISTINCT/gi) ?? []).length).toBe(2);
  });

  it("loads the limited records through the materialized ids", async () => {
    const orders = await CpkOrder.eagerLoad(":books").order("cpk_orders.id").limit(1);
    expect(orders.length).toBe(1);
  });
});
