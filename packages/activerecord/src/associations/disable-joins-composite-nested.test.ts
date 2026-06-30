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
 *   CknShop
 *     has_many :cknOrders (shop_id → shop.id)
 *     has_many :cknLineItemsThroughOrders, through: :cknOrders,
 *                                          source: :cknLineItems
 *       # source edge uses composite FK
 *       # (ckn_order_shop_id, ckn_order_number) →
 *       # CknOrder's composite PK (shop_id, order_number)
 *     has_many :cknLineItemTags, through: :cknLineItemsThroughOrders,
 *                                source: :cknTags,
 *                                disable_joins: true
 *       # Nested-through — `through:` is itself a through
 *
 * The walk runs three step queries (orders → line_items →
 * line_item_tags) — the middle step emits an Arel OR-of-AND
 * composite predicate from PredicateBuilder.buildComposite.
 *
 * Tables use the `ckn_*` prefix (not `ck_*`) to avoid colliding
 * with disable-joins-composite-key.test.ts on the same worker.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base, MigrationContext, registerModel } from "../index.js";
import { Associations, loadHasMany } from "../associations.js";
import { setupFixtures } from "../test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

function migrationCtx() {
  return new MigrationContext(Base.connection);
}

describe("DJAS composite-key + nested-through", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();

  class CknShop extends Base {
    static {
      this._tableName = "ckn_shops";
      this.attribute("name", "string");
    }
  }
  class CknOrder extends Base {
    static {
      this._tableName = "ckn_orders";
      this.primaryKey = ["shop_id", "order_number"];
      this.attribute("shop_id", "integer");
      this.attribute("order_number", "integer");
      this.attribute("label", "string");
    }
  }
  class CknLineItem extends Base {
    static {
      this._tableName = "ckn_line_items";
      this.attribute("ckn_order_shop_id", "integer");
      this.attribute("ckn_order_number", "integer");
      this.attribute("sku", "string");
    }
  }
  class CknTag extends Base {
    static {
      this._tableName = "ckn_tags";
      this.attribute("ckn_line_item_id", "integer");
      this.attribute("value", "string");
    }
  }

  beforeAll(async () => {
    await migrationCtx().createTable("ckn_shops", { force: true }, (t: any) => {
      t.string("name");
    });
    await migrationCtx().createTable(
      "ckn_orders",
      { primaryKey: ["shop_id", "order_number"], force: true },
      (t: any) => {
        t.integer("shop_id");
        t.integer("order_number");
        t.string("label");
      },
    );
    await migrationCtx().createTable("ckn_line_items", { force: true }, (t: any) => {
      t.integer("ckn_order_shop_id");
      t.integer("ckn_order_number");
      t.string("sku");
    });
    await migrationCtx().createTable("ckn_tags", { force: true }, (t: any) => {
      t.integer("ckn_line_item_id");
      t.string("value");
    });
    registerModel("CknShop", CknShop);
    registerModel("CknOrder", CknOrder);
    registerModel("CknLineItem", CknLineItem);
    registerModel("CknTag", CknTag);
    (CknShop as any)._associations = [];
    (CknShop as any)._reflections = {};
    (CknOrder as any)._associations = [];
    (CknOrder as any)._reflections = {};
    (CknLineItem as any)._associations = [];
    (CknLineItem as any)._reflections = {};

    Associations.hasMany.call(CknShop, "cknOrders", {
      className: "CknOrder",
      foreignKey: "shop_id",
    });
    Associations.hasMany.call(CknOrder, "cknLineItems", {
      className: "CknLineItem",
      foreignKey: ["ckn_order_shop_id", "ckn_order_number"],
      primaryKey: ["shop_id", "order_number"],
    });
    Associations.hasMany.call(CknLineItem, "cknTags", {
      className: "CknTag",
      foreignKey: "ckn_line_item_id",
    });
    Associations.hasMany.call(CknShop, "cknLineItemsThroughOrders", {
      className: "CknLineItem",
      through: "cknOrders",
      source: "cknLineItems",
    });
    Associations.hasMany.call(CknShop, "cknLineItemTags", {
      className: "CknTag",
      through: "cknLineItemsThroughOrders",
      source: "cknTags",
      disableJoins: true,
    });
  });

  afterAll(async () => {
    await migrationCtx().dropTable("ckn_tags", "ckn_line_items", "ckn_orders", "ckn_shops", {
      ifExists: true,
    });
  });

  afterEach(() => Notifications.unsubscribeAll());

  it("loads through a nested-through whose middle edge is composite-FK, with no JOIN", async () => {
    const shop = await CknShop.create({ name: "S" });
    const order = (await CknOrder.create({
      shop_id: shop.id,
      order_number: 100,
      label: "ord",
    })) as any;
    const li = (await CknLineItem.create({
      ckn_order_shop_id: order.shop_id,
      ckn_order_number: order.order_number,
      sku: "sku-1",
    })) as any;
    await CknTag.create({ ckn_line_item_id: li.id, value: "red" });
    await CknTag.create({ ckn_line_item_id: li.id, value: "sale" });

    const other = await CknShop.create({ name: "Other" });
    const otherOrder = (await CknOrder.create({
      shop_id: other.id,
      order_number: 999,
      label: "other-ord",
    })) as any;
    const otherLi = (await CknLineItem.create({
      ckn_order_shop_id: otherOrder.shop_id,
      ckn_order_number: otherOrder.order_number,
      sku: "other-sku",
    })) as any;
    await CknTag.create({ ckn_line_item_id: otherLi.id, value: "leak-check" });

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      const sql = event?.payload?.sql;
      if (event?.payload?.name === "SCHEMA") return;
      if (typeof sql === "string") observed.push(sql);
    });
    try {
      const reflection = (CknShop as any)._reflectOnAssociation("cknLineItemTags");
      const tags = await loadHasMany(shop, "cknLineItemTags", reflection.options);
      expect(tags.map((t: any) => t.value).sort()).toEqual(["red", "sale"]);
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(observed.length).toBeGreaterThan(0);
    expect(observed.some((s) => /\bJOIN\b/i.test(s))).toBe(false);
    expect(
      observed.some(
        (s) => /ckn_order_shop_id/i.test(s) && /ckn_order_number/i.test(s) && /\bAND\b/i.test(s),
      ),
    ).toBe(true);
  });

  it("unsaved owner returns [] even when orphan through rows have NULL FKs", async () => {
    const orphanLi = (await CknLineItem.create({
      ckn_order_shop_id: null as any,
      ckn_order_number: null as any,
      sku: "orphan-sku",
    })) as any;
    await CknTag.create({ ckn_line_item_id: orphanLi.id, value: "orphan-tag" });

    const unsaved = CknShop.new({ name: "unsaved" });
    const reflection = (CknShop as any)._reflectOnAssociation("cknLineItemTags");
    const tags = await loadHasMany(unsaved, "cknLineItemTags", reflection.options);
    expect(tags).toEqual([]);
    expect(tags.map((t: any) => t.value)).not.toContain("orphan-tag");
  });
});
