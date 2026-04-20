/**
 * Composite-key support in DisableJoinsAssociationScope.
 *
 * DJAS delegates composite matching to the positional composite form
 * `where(columns, tuples)`, which routes through
 * `PredicateBuilder.buildComposite` (PR #647). That helper emits the
 * composite predicate (Arel `OR`-of-`AND` over per-column equalities,
 * matching `counter-cache.ts#buildPkPredicate`) so DJAS itself stays
 * a thin chain-walker — same layering as Rails'
 * `disable_joins_association_scope.rb:34` (`where(key => join_ids)`
 * with PredicateBuilder doing the composite work).
 *
 * This test covers the current composite-key path used for disable-
 * joins through associations: tuple-style matching across the
 * intermediate records, no JOIN in the generated query shape.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base, registerModel } from "../index.js";
import { Associations, loadHasMany } from "../associations.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("DJAS — composite key support", () => {
  let adapter: DatabaseAdapter;

  // Shopify-style composite-PK shape: (shop_id, order_number). We
  // avoid `id` as the second PK column because Base.id is an accessor
  // that collides with raw column reads on test-adapter.
  class CkShop extends Base {
    static {
      this._tableName = "ck_shops";
      this.attribute("name", "string");
    }
  }
  class CkOrder extends Base {
    static {
      this._tableName = "ck_orders";
      this.primaryKey = ["shop_id", "order_number"];
      this.attribute("shop_id", "integer");
      this.attribute("order_number", "integer");
      this.attribute("name", "string");
    }
  }
  class CkLineItem extends Base {
    static {
      this._tableName = "ck_line_items";
      this.attribute("ck_order_shop_id", "integer");
      this.attribute("ck_order_number", "integer");
      this.attribute("sku", "string");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    CkShop.adapter = adapter;
    CkOrder.adapter = adapter;
    CkLineItem.adapter = adapter;
    registerModel("CkShop", CkShop);
    registerModel("CkOrder", CkOrder);
    registerModel("CkLineItem", CkLineItem);
    (CkShop as any)._associations = [];
    (CkOrder as any)._associations = [];
    (CkLineItem as any)._associations = [];
    Associations.hasMany.call(CkShop, "ckOrders", {
      className: "CkOrder",
      foreignKey: "shop_id",
    });
    // Composite FK on line_items references CkOrder's composite PK.
    Associations.hasMany.call(CkOrder, "ckLineItems", {
      className: "CkLineItem",
      foreignKey: ["ck_order_shop_id", "ck_order_number"],
      primaryKey: ["shop_id", "order_number"],
    });
    Associations.hasMany.call(CkShop, "ckLineItemsThroughOrders", {
      className: "CkLineItem",
      through: "ckOrders",
      source: "ckLineItems",
      disableJoins: true,
    });
  });

  // Backstop in case a test throws before reaching its in-test
  // unsubscribe. Same pattern as instrumentation.test.ts.
  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  it("loads through a composite-PK chain via composite-key WHERE — no JOIN", async () => {
    const shop = await CkShop.create({ name: "S" });
    const order = (await CkOrder.create({
      shop_id: shop.id,
      order_number: 100,
      name: "O",
    })) as any;
    await CkLineItem.create({
      ck_order_shop_id: order.shop_id,
      ck_order_number: order.order_number,
      sku: "sku-1",
    });
    await CkLineItem.create({
      ck_order_shop_id: order.shop_id,
      ck_order_number: order.order_number,
      sku: "sku-2",
    });

    // Capture SQL to actually prove the "no JOIN" claim — without
    // this, the test would still pass if the loader regressed to a
    // JOIN-based path.
    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      const sql = event?.payload?.sql;
      if (typeof sql === "string") observed.push(sql);
    });
    try {
      const reflection = (CkShop as any)._reflectOnAssociation("ckLineItemsThroughOrders");
      const items = await loadHasMany(shop, "ckLineItemsThroughOrders", reflection.options);
      expect(items.map((i: any) => i.sku).sort()).toEqual(["sku-1", "sku-2"]);
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(observed.length).toBeGreaterThan(0);
    expect(observed.some((s) => /\bJOIN\b/i.test(s))).toBe(false);
  });

  it("composite-key + ordered upstream: skips DJAR wrap (records load via composite-key WHERE, no in-list reorder)", async () => {
    // Document the trade-off: composite-key chains skip the loaded-
    // chain DJAR wrap because DJAR's per-key group-by would need
    // tuple grouping (out of scope for this PR). Records still load
    // correctly via the composite-key WHERE; they just aren't re-ordered
    // by through-table sequence. Future work could extend DJAR to
    // group by tuple keys.
    Associations.hasMany.call(CkShop, "ckOrdersOrdered", {
      className: "CkOrder",
      foreignKey: "shop_id",
      scope: (rel: any) => rel.order("name"),
    });
    Associations.hasMany.call(CkShop, "ckLineItemsOrdered", {
      className: "CkLineItem",
      through: "ckOrdersOrdered",
      source: "ckLineItems",
      disableJoins: true,
    });
    const shop = await CkShop.create({ name: "S" });
    const orderB = (await CkOrder.create({
      shop_id: shop.id,
      order_number: 200,
      name: "b",
    })) as any;
    const orderA = (await CkOrder.create({
      shop_id: shop.id,
      order_number: 100,
      name: "a",
    })) as any;
    await CkLineItem.create({
      ck_order_shop_id: orderB.shop_id,
      ck_order_number: orderB.order_number,
      sku: "from-b",
    });
    await CkLineItem.create({
      ck_order_shop_id: orderA.shop_id,
      ck_order_number: orderA.order_number,
      sku: "from-a",
    });

    const reflection = (CkShop as any)._reflectOnAssociation("ckLineItemsOrdered");
    const items = await loadHasMany(shop, "ckLineItemsOrdered", reflection.options);
    // Both records load. Order is DB-arbitrary (no reorder applied
    // for composite + ordered-upstream); just assert presence.
    expect(items.map((i: any) => i.sku).sort()).toEqual(["from-a", "from-b"]);
  });

  it("skips tuples containing null/undefined (matches SQL tuple-equality semantics, not Arel IS NULL)", async () => {
    // Regression: Arel's Attribute#eq(null) emits IS NULL, but SQL
    // tuple-equality treats any null component as a non-match.
    // The composite path now goes DJAS → Relation#where(cols, tuples)
    // → PredicateBuilder.buildComposite, which handles the null /
    // undefined filter and the empty-list short-circuit (→ none()).
    // Mirrors counter-cache.ts#buildPkPredicate's null handling.
    const shop = await CkShop.create({ name: "S" });
    const order = (await CkOrder.create({
      shop_id: shop.id,
      order_number: 100,
      name: "O",
    })) as any;
    // line item with a NULL composite component — not a match for
    // any (shop_id, order_number) tuple.
    await CkLineItem.create({
      ck_order_shop_id: order.shop_id,
      ck_order_number: null as any,
      sku: "orphan",
    });
    await CkLineItem.create({
      ck_order_shop_id: order.shop_id,
      ck_order_number: order.order_number,
      sku: "valid",
    });

    const reflection = (CkShop as any)._reflectOnAssociation("ckLineItemsThroughOrders");
    const items = await loadHasMany(shop, "ckLineItemsThroughOrders", reflection.options);
    // Only the "valid" record is returned — the orphan with
    // ck_order_number=NULL doesn't match the (shop_id=1, order_number=100)
    // tuple even though shop_id matches.
    expect(items.map((i: any) => i.sku)).toEqual(["valid"]);
  });

  it("returns no rows when the composite-key tuple list is empty (owner has no through records)", async () => {
    const shop = await CkShop.create({ name: "Lonely" });
    // No orders for this shop → through-records pluck yields [] →
    // composite-key WHERE short-circuits to a never-true predicate.
    const reflection = (CkShop as any)._reflectOnAssociation("ckLineItemsThroughOrders");
    const items = await loadHasMany(shop, "ckLineItemsThroughOrders", reflection.options);
    expect(items).toEqual([]);
  });
});
