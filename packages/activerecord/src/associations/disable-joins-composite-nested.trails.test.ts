import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { fixtures } from "../test-fixtures.js";

describe("DJAS composite-key + nested-through", () => {
  fixtures([]);

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
    await Base.connection.createTable("ckn_shops", { force: true }, (t: any) => {
      t.string("name");
    });
    await Base.connection.createTable(
      "ckn_orders",
      { primaryKey: ["shop_id", "order_number"], force: true },
      (t: any) => {
        t.integer("shop_id");
        t.integer("order_number");
        t.string("label");
      },
    );
    await Base.connection.createTable("ckn_line_items", { force: true }, (t: any) => {
      t.integer("ckn_order_shop_id");
      t.integer("ckn_order_number");
      t.string("sku");
    });
    await Base.connection.createTable("ckn_tags", { force: true }, (t: any) => {
      t.integer("ckn_line_item_id");
      t.string("value");
    });
    registerModel("CknShop", CknShop);
    registerModel("CknOrder", CknOrder);
    registerModel("CknLineItem", CknLineItem);
    registerModel("CknTag", CknTag);
    (CknShop as any)._reflections = {};
    (CknOrder as any)._reflections = {};
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
    await Base.connection.dropTable("ckn_tags", "ckn_line_items", "ckn_orders", "ckn_shops", {
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
      const tags = await (shop as any).cknLineItemTags.toArray();
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
    const tags = await (unsaved as any).cknLineItemTags.toArray();
    expect(tags).toEqual([]);
    expect(tags.map((t: any) => t.value)).not.toContain("orphan-tag");
  });
});
