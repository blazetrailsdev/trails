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
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base, registerModel } from "../index.js";
import { Associations, loadHasMany } from "../associations.js";
import { defineSchema, type Schema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

const CKN_SCHEMA: Schema = {
  /* eslint-disable blazetrails/require-canonical-schema -- trails-internal DJAS composite-key nested-through harness; ckn_* tables have no schema.rb analog (composite PK shape) */
  ckn_shops: { name: "string" },
  ckn_orders: {
    columns: {
      shop_id: "integer",
      order_number: "integer",
      label: "string",
    },
    primaryKey: ["shop_id", "order_number"],
  },
  ckn_line_items: {
    ckn_order_shop_id: "integer",
    ckn_order_number: "integer",
    sku: "string",
  },
  ckn_tags: { ckn_line_item_id: "integer", value: "string" },
  /* eslint-enable blazetrails/require-canonical-schema */
};

describe("DJAS composite-key + nested-through", () => {
  setupHandlerSuite();
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
    await defineSchema(CKN_SCHEMA);
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
    // Nested through + composite FK on the middle edge + disable_joins.
    Associations.hasMany.call(CknShop, "cknLineItemTags", {
      className: "CknTag",
      through: "cknLineItemsThroughOrders",
      source: "cknTags",
      disableJoins: true,
    });
  });

  afterAll(async () => {
    for (const t of ["ckn_tags", "ckn_line_items", "ckn_orders", "ckn_shops"]) {
      await Base.connection.executeMutation(`DROP TABLE IF EXISTS ${t}`);
    }
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

    // Another shop's chain — must not leak. Proves the walk's
    // first-step filter by shop.id is holding.
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
      // Ignore adapter-internal SCHEMA introspection (e.g. PG type-map loads
      // that LEFT JOIN pg_range) — matches Rails' SQLCounter, which never
      // counts SCHEMA queries; not an association JOIN.
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
        (s) => /ckn_order_shop_id/i.test(s) && /ckn_order_number/i.test(s) && /\bAND\b/i.test(s),
      ),
    ).toBe(true);
  });

  it("unsaved owner returns [] even when orphan through rows have NULL FKs", async () => {
    // PredicateBuilder's ArrayHandler folds `[null]` into
    // `key IS NULL`. Without the `isNewRecord()` short-circuit,
    // an unsaved owner whose PK is null would seed DJAS with
    // `[null]`, and the first-step WHERE would match orphan through
    // rows whose FK is null — leaking into the chain as a phantom
    // association. Create the orphan on CknLineItem (its composite
    // FK columns are nullable) rather than CknOrder (whose shop_id
    // is part of its composite PK and implicitly NOT NULL on
    // PG/MySQL).
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
