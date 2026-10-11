import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { fixtures } from "../test-fixtures.js";

describe("DJAS — composite key support", () => {
  fixtures([]);

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
    await (
      await Base.leaseConnection()
    ).createTable("ck_shops", { force: true }, (t: any) => {
      t.string("name");
    });
    await (
      await Base.leaseConnection()
    ).createTable(
      "ck_orders",
      { primaryKey: ["shop_id", "order_number"], force: true },
      (t: any) => {
        t.integer("shop_id");
        t.integer("order_number");
        t.string("name");
      },
    );
    await (
      await Base.leaseConnection()
    ).createTable("ck_line_items", { force: true }, (t: any) => {
      t.integer("ck_order_shop_id");
      t.integer("ck_order_number");
      t.string("sku");
    });
    registerModel("CkShop", CkShop);
    registerModel("CkOrder", CkOrder);
    registerModel("CkLineItem", CkLineItem);
    (CkShop as any)._reflections = {};
    (CkOrder as any)._reflections = {};
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
    Associations.hasMany.call(CkShop, "ckLineItemsThroughOrders", {
      className: "CkLineItem",
      through: "ckOrders",
      source: "ckLineItems",
      disableJoins: true,
    });
  });

  afterAll(async () => {
    await (
      await Base.leaseConnection()
    ).dropTable("ck_line_items", "ck_orders", "ck_shops", { ifExists: true });
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
      const items = (await shop.association("ckLineItemsThroughOrders").loadTarget()) as Base[];
      expect(items.map((i: any) => i.sku).sort()).toEqual(["sku-1", "sku-2"]);
      expect(await shop.association("ckLineItemsThroughOrders").scope().invertWhere()).toEqual([]);
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(observed.length).toBeGreaterThan(0);
    expect(observed.some((s) => /\bJOIN\b/i.test(s))).toBe(false);
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
    const items = (await shop.association("ckLineItemsThroughOrders").loadTarget()) as Base[];
    expect(items.map((i: any) => i.sku)).toEqual(["valid"]);
  });
});
