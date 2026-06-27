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
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base, MigrationContext, registerModel } from "../index.js";
import { Associations, loadHasMany } from "../associations.js";
import { DisableJoinsAssociationRelation } from "../disable-joins-association-relation.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

function migrationCtx() {
  return new MigrationContext(Base.connection);
}

describe("DJAS — composite key support", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();

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

  beforeAll(async () => {
    await migrationCtx().createTable("ck_shops", { force: true }, (t: any) => {
      t.string("name");
    });
    await migrationCtx().createTable(
      "ck_orders",
      { primaryKey: ["shop_id", "order_number"], force: true },
      (t: any) => {
        t.integer("shop_id");
        t.integer("order_number");
        t.string("name");
      },
    );
    await migrationCtx().createTable("ck_line_items", { force: true }, (t: any) => {
      t.integer("ck_order_shop_id");
      t.integer("ck_order_number");
      t.string("sku");
    });
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

  afterAll(async () => {
    await migrationCtx().dropTable("ck_line_items", "ck_orders", "ck_shops", { ifExists: true });
  });

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

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      const sql = event?.payload?.sql;
      if (event?.payload?.name === "SCHEMA") return;
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
    expect(items.map((i: any) => i.sku)).toEqual(["from-a", "from-b"]);
  });

  it("skips tuples containing null/undefined (matches SQL tuple-equality semantics, not Arel IS NULL)", async () => {
    const shop = await CkShop.create({ name: "S" });
    const order = (await CkOrder.create({
      shop_id: shop.id,
      order_number: 100,
      name: "O",
    })) as any;
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
    expect(items.map((i: any) => i.sku)).toEqual(["valid"]);
  });

  it("DisableJoinsAssociationRelation composite-key load: dedupes tuples and reorders by ids on load", async () => {
    const shop = await CkShop.create({ name: "S" });
    const orderA = (await CkOrder.create({
      shop_id: shop.id,
      order_number: 100,
      name: "a",
    })) as any;
    const orderB = (await CkOrder.create({
      shop_id: shop.id,
      order_number: 200,
      name: "b",
    })) as any;
    await CkLineItem.create({
      ck_order_shop_id: orderA.shop_id,
      ck_order_number: orderA.order_number,
      sku: "la",
    });
    await CkLineItem.create({
      ck_order_shop_id: orderB.shop_id,
      ck_order_number: orderB.order_number,
      sku: "lb",
    });

    const djar = (
      new DisableJoinsAssociationRelation(
        CkLineItem,
        ["ck_order_shop_id", "ck_order_number"],
        [
          [shop.id, 200],
          [shop.id, 100],
          [shop.id, 200],
        ],
      ) as any
    ).where(
      ["ck_order_shop_id", "ck_order_number"],
      [
        [shop.id, 100],
        [shop.id, 200],
      ],
    );
    const loaded = await djar.toArray();
    expect(loaded.map((r: any) => r.sku)).toEqual(["lb", "la"]);
    expect(await djar.ids()).toEqual([
      [shop.id, 200],
      [shop.id, 100],
    ]);
  });

  it("DisableJoinsAssociationRelation composite-key load: bigint tuple components don't crash serialization", async () => {
    const djar = new DisableJoinsAssociationRelation(
      CkLineItem,
      ["ck_order_shop_id", "ck_order_number"],
      [
        [1n, 100n],
        [1n, 100n],
      ],
    );
    expect(await djar.ids()).toEqual([[1n, 100n]]);
    await expect(djar.toArray()).resolves.toEqual([]);
  });

  it("DisableJoinsAssociationRelation key normalization: empty array throws, single-element array collapses to string", async () => {
    expect(() => new DisableJoinsAssociationRelation(CkLineItem, [] as any, [])).toThrow(
      /at least one column/,
    );
    expect(() => new DisableJoinsAssociationRelation(CkLineItem, "", [1])).toThrow(
      /key must not be empty/,
    );
    const djarTuples = new DisableJoinsAssociationRelation(CkLineItem, ["sku"], [["a"], ["b"]]);
    expect(djarTuples.key).toBe("sku");
    expect(await djarTuples.ids()).toEqual(["a", "b"]);

    expect(
      () =>
        new DisableJoinsAssociationRelation(CkLineItem, ["sku"], [
          [1, 2],
        ] as unknown as unknown[][]),
    ).toThrow(/single-element array/);

    expect(() => new DisableJoinsAssociationRelation(CkLineItem, "sku", [[1], [2]] as any)).toThrow(
      /must not be an array/,
    );

    expect(
      () => new DisableJoinsAssociationRelation(CkLineItem, "sku", new Set(["a"]) as any),
    ).toThrow(/ids must be an array/);
    expect(() => new DisableJoinsAssociationRelation(CkLineItem, "sku", null as any)).toThrow(
      /ids must be an array/,
    );

    const djar = new DisableJoinsAssociationRelation(
      CkLineItem,
      ["ck_order_shop_id", "ck_order_number"],
      [[1, 100]],
    );
    const returned = (await djar.ids()) as unknown[][];
    returned.push([999, 999]);
    returned[0][1] = 42;
    expect(await djar.ids()).toEqual([[1, 100]]);
  });

  it("DisableJoinsAssociationRelation composite-key load: throws ArgumentError on shape/arity mismatch", async () => {
    expect(
      () =>
        new DisableJoinsAssociationRelation(CkLineItem, ["ck_order_shop_id", "ck_order_number"], [
          1, 2, 3,
        ] as any),
    ).toThrow(/must be an array/);
    expect(
      () =>
        new DisableJoinsAssociationRelation(CkLineItem, ["ck_order_shop_id", "ck_order_number"], [
          [1, 2, 3],
        ] as any),
    ).toThrow(/arity/);
  });

  it("composite-key + ordered upstream + empty through: preserves none() instead of full table scan", async () => {
    Associations.hasMany.call(CkShop, "ckOrdersOrdered2", {
      className: "CkOrder",
      foreignKey: "shop_id",
      scope: (rel: any) => rel.order("name"),
    });
    Associations.hasMany.call(CkShop, "ckLineItemsEmpty", {
      className: "CkLineItem",
      through: "ckOrdersOrdered2",
      source: "ckLineItems",
      disableJoins: true,
    });
    const shop = await CkShop.create({ name: "S" });
    const allSql: unknown[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      allSql.push(event?.payload?.sql);
    });
    try {
      const reflection = (CkShop as any)._reflectOnAssociation("ckLineItemsEmpty");
      const items = await loadHasMany(shop, "ckLineItemsEmpty", reflection.options);
      expect(items).toEqual([]);
    } finally {
      Notifications.unsubscribe(sub);
    }
    const observed = allSql.filter(
      (sql): sql is string =>
        typeof sql === "string" && /\bFROM\b\s+["`]?ck_line_items\b/i.test(sql),
    );
    expect(observed).toEqual([]);
  });

  it("returns no rows when the composite-key tuple list is empty (owner has no through records)", async () => {
    const shop = await CkShop.create({ name: "Lonely" });
    const reflection = (CkShop as any)._reflectOnAssociation("ckLineItemsThroughOrders");
    const items = await loadHasMany(shop, "ckLineItemsThroughOrders", reflection.options);
    expect(items).toEqual([]);
  });
});
