/**
 * Preloader::ThroughAssociation#through_scope — scoped source through a
 * composite-PK, non-HABTM through model.
 *
 * A trails-only pin (no canonical association routes a scoped source through a
 * composite-PK non-HABTM model): `Cpk::Order has_many :tags, through:
 * :order_tags` routes through `Cpk::OrderTag`, whose table `cpk_order_tags` has
 * a DB-level composite primary key `[:order_id, :tag_id]`. The source
 * (`belongs_to :tag`) is to-one, so `through_scope` takes Rails' single-query
 * JOIN branch: the FULL reflection-scope `where_clause` is copied onto the
 * through query and the source (`cpk_tags`) is eager-JOINed.
 *
 * `Relation#_eagerLoadBypassesJoinDependency` used to degrade ANY composite-PK
 * base's eager load to preload — which would orphan the copied source-table
 * predicate onto a query that never joins `cpk_tags` (`no such column`). It now
 * bypasses a composite-PK base only for the LIMIT+collection `_materializeLimitedIds`
 * path, so this unlimited through-preload JOIN materializes like Rails and a
 * MIXED predicate spanning BOTH the through table (`cpk_order_tags`) and the
 * source table (`cpk_tags`) — which no two-step split can resolve — is answered
 * in one JOINed query.
 */
import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Preloader } from "./preloader.js";
import { ThroughAssociation } from "./preloader/through-association.js";
import { CpkOrder, CpkOrderTag, CpkTag } from "../test-helpers/models/cpk.js";

registerModel([CpkOrder, CpkOrderTag, CpkTag]);

// A MIXED predicate referencing both the through table (`cpk_order_tags`) and
// the source table (`cpk_tags`) in one node, on a scoped source through the
// composite-PK `Cpk::OrderTag`. `cpk_order_tags.attached_reason` is NULL in the
// fixtures, so the predicate reduces to `cpk_tags.name = 'Loyal customer'`.
CpkOrder.hasMany("tagsWithMixedCondition", {
  className: "CpkTag",
  through: "orderTags",
  source: "tag",
  scope: (rel) =>
    rel.where("cpk_order_tags.attached_reason = 'x' OR cpk_tags.name = 'Loyal customer'"),
});

interface ThroughScopeProbe {
  _buildThroughScope(): { toSql(): string };
}

describe("Preloader::ThroughAssociation#through_scope composite-PK through", () => {
  const { cpkOrders } = fixtures(["cpkOrders", "cpkTags", "cpkOrderTags"]);

  function throughLoader(owners: CpkOrder[], name: string): ThroughAssociation {
    const loaders = new Preloader({
      records: owners,
      associations: [name],
      associateByDefault: false,
    }).loaders;
    const loader = loaders.find((l) => l instanceof ThroughAssociation);
    if (!loader) throw new Error("expected a ThroughAssociation loader");
    return loader;
  }

  it("JOINs the source and copies a mixed through+source predicate onto the composite-PK through query", () => {
    const order = cpkOrders("cpk_groceries_order_1");
    const loader = throughLoader([order], "tagsWithMixedCondition");
    const sql = (loader as unknown as ThroughScopeProbe)._buildThroughScope().toSql();
    // Both the through-table and source-table columns are referenced in one
    // predicate, and the source is eager-JOINed so both resolve in one query.
    expect(sql).toContain("cpk_order_tags");
    expect(sql).toContain("cpk_tags");
    expect(sql).toMatch(/JOIN .*cpk_tags/);
  });

  it("preloads a scoped source through a composite-PK model without orphaning the source predicate", async () => {
    const order = cpkOrders("cpk_groceries_order_1");
    const [row] = await CpkOrder.where({
      shop_id: order.shop_id,
      id: order.readAttribute("id"),
    }).preload("tagsWithMixedCondition");
    const tags = (row.association("tagsWithMixedCondition").target ?? []) as CpkTag[];
    expect(tags.map((t) => t.name)).toEqual(["Loyal customer"]);
  });
});
