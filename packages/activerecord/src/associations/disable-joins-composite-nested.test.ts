/**
 * DJAS composite-key + nested-through intersection (task #19).
 *
 * PR #645 shipped composite-key support via
 * `PredicateBuilder.buildComposite`; PR #668 dropped the nested-
 * through routing gate. Each PR has its own test coverage, but
 * the combination — a nested-through whose composite-key edge
 * forces the buildComposite predicate into the reverseChain walk —
 * wasn't exercised directly.
 *
 * Chain here:
 *   CkShop
 *     has_many :ckOrders (shop_id → shop.id)
 *     has_many :ckLineItemsThroughOrders, through: :ckOrders,
 *                                         source: :ckLineItems
 *       # source edge uses composite FK
 *       # (ck_order_shop_id, ck_order_number) →
 *       # CkOrder's composite PK (shop_id, order_number)
 *     has_many :ckLineItemTags, through: :ckLineItemsThroughOrders,
 *                               source: :ckTags,
 *                               disable_joins: true
 *       # Nested-through — `through:` is itself a through
 *
 * The walk runs three step queries (orders → line_items →
 * line_item_tags) — the middle step emits an Arel OR-of-AND
 * composite predicate from PredicateBuilder.buildComposite.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base, registerModel } from "../index.js";
import { Associations, loadHasMany } from "../associations.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("DJAS composite-key + nested-through", () => {
  let adapter: DatabaseAdapter;

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
      this.attribute("label", "string");
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
  class CkTag extends Base {
    static {
      this._tableName = "ck_tags";
      this.attribute("ck_line_item_id", "integer");
      this.attribute("value", "string");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    CkShop.adapter = adapter;
    CkOrder.adapter = adapter;
    CkLineItem.adapter = adapter;
    CkTag.adapter = adapter;
    registerModel("CkShop", CkShop);
    registerModel("CkOrder", CkOrder);
    registerModel("CkLineItem", CkLineItem);
    registerModel("CkTag", CkTag);
    (CkShop as any)._associations = [];
    (CkShop as any)._reflections = {};
    (CkOrder as any)._associations = [];
    (CkOrder as any)._reflections = {};
    (CkLineItem as any)._associations = [];
    (CkLineItem as any)._reflections = {};

    Associations.hasMany.call(CkShop, "ckOrders", {
      className: "CkOrder",
      foreignKey: "shop_id",
    });
    Associations.hasMany.call(CkOrder, "ckLineItems", {
      className: "CkLineItem",
      foreignKey: ["ck_order_shop_id", "ck_order_number"],
      primaryKey: ["shop_id", "order_number"],
    });
    Associations.hasMany.call(CkLineItem, "ckTags", {
      className: "CkTag",
      foreignKey: "ck_line_item_id",
    });
    Associations.hasMany.call(CkShop, "ckLineItemsThroughOrders", {
      className: "CkLineItem",
      through: "ckOrders",
      source: "ckLineItems",
    });
    // Nested through + composite FK on the middle edge + disable_joins.
    Associations.hasMany.call(CkShop, "ckLineItemTags", {
      className: "CkTag",
      through: "ckLineItemsThroughOrders",
      source: "ckTags",
      disableJoins: true,
    });
  });

  afterEach(() => Notifications.unsubscribeAll());

  it("loads through a nested-through whose middle edge is composite-FK, with no JOIN", async () => {
    const shop = await CkShop.create({ name: "S" });
    const order = (await CkOrder.create({
      shop_id: shop.id,
      order_number: 100,
      label: "ord",
    })) as any;
    const li = (await CkLineItem.create({
      ck_order_shop_id: order.shop_id,
      ck_order_number: order.order_number,
      sku: "sku-1",
    })) as any;
    await CkTag.create({ ck_line_item_id: li.id, value: "red" });
    await CkTag.create({ ck_line_item_id: li.id, value: "sale" });

    // Another shop's chain — must not leak. Proves the walk's
    // first-step filter by shop.id is holding.
    const other = await CkShop.create({ name: "Other" });
    const otherOrder = (await CkOrder.create({
      shop_id: other.id,
      order_number: 999,
      label: "other-ord",
    })) as any;
    const otherLi = (await CkLineItem.create({
      ck_order_shop_id: otherOrder.shop_id,
      ck_order_number: otherOrder.order_number,
      sku: "other-sku",
    })) as any;
    await CkTag.create({ ck_line_item_id: otherLi.id, value: "leak-check" });

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      const sql = event?.payload?.sql;
      if (typeof sql === "string") observed.push(sql);
    });
    try {
      const reflection = (CkShop as any)._reflectOnAssociation("ckLineItemTags");
      const tags = await loadHasMany(shop, "ckLineItemTags", reflection.options);
      expect(tags.map((t: any) => t.value).sort()).toEqual(["red", "sale"]);
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(observed.length).toBeGreaterThan(0);
    // DJAS walks step-by-step — three SELECTs, no JOIN across the
    // chain. A regression that fell back to AssociationScope (or
    // regressed buildComposite into an IN-subquery in the nested
    // case) would show a JOIN.
    expect(observed.some((s) => /\bJOIN\b/i.test(s))).toBe(false);
    // The composite edge must fire the OR-of-AND predicate shape
    // PredicateBuilder.buildComposite emits — referring to both
    // composite columns alongside each other in the WHERE.
    expect(
      observed.some(
        (s) => /ck_order_shop_id/i.test(s) && /ck_order_number/i.test(s) && /\bAND\b/i.test(s),
      ),
    ).toBe(true);
  });

  it("unsaved owner returns [] even when orphan through rows have NULL FKs", async () => {
    // PredicateBuilder's ArrayHandler folds `[null]` into
    // `key IS NULL`. Without the `isNewRecord()` short-circuit,
    // an unsaved owner whose PK is null would seed DJAS with
    // `[null]`, and the first-step WHERE would match orphan through
    // rows whose FK is null — leaking into the chain as a phantom
    // association. Create the orphan on CkLineItem (its composite
    // FK columns are nullable) rather than CkOrder (whose shop_id
    // is part of its composite PK and implicitly NOT NULL on
    // PG/MySQL).
    const orphanLi = (await CkLineItem.create({
      ck_order_shop_id: null as any,
      ck_order_number: null as any,
      sku: "orphan-sku",
    })) as any;
    await CkTag.create({ ck_line_item_id: orphanLi.id, value: "orphan-tag" });

    const unsaved = CkShop.new({ name: "unsaved" });
    const reflection = (CkShop as any)._reflectOnAssociation("ckLineItemTags");
    const tags = await loadHasMany(unsaved, "ckLineItemTags", reflection.options);
    expect(tags).toEqual([]);
    expect(tags.map((t: any) => t.value)).not.toContain("orphan-tag");
  });
});
