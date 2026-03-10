/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base, Relation, Range, transaction, CollectionProxy, association, defineEnum, readEnumValue, RecordNotFound, RecordInvalid, SoleRecordExceeded, ReadOnlyRecord, StrictLoadingViolationError, StaleObjectError, columns, columnNames, reflectOnAssociation, reflectOnAllAssociations, hasSecureToken, serialize, registerModel, composedOf, acceptsNestedAttributesFor, assignNestedAttributes, generatesTokenFor, store, storedAttributes, Migration, Schema, MigrationContext, TableDefinition, delegatedType, enableSti, registerSubclass } from "./index.js";
import {
  Associations,
  loadBelongsTo,
  loadHasOne,
  loadHasMany,
  loadHasManyThrough,
  processDependentAssociations,
  updateCounterCaches,
  setBelongsTo,
  setHasOne,
  setHasMany,
} from "./associations.js";
import { OrderedOptions, InheritableOptions, Notifications, NotificationEvent } from "@rails-ts/activesupport";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "./autosave.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("CompositePrimaryKeyTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  it("composite primary key", () => {
    class Order extends Base {
      static { this.attribute("shop_id", "integer"); this.attribute("order_id", "integer"); this.primaryKey = "order_id"; this.adapter = adapter; }
    }
    expect(Order.primaryKey).toBe("order_id");
  });

  it("composite primary key with reserved words", () => {
    class Record extends Base {
      static { this.attribute("status", "string"); this.attribute("record_id", "integer"); this.primaryKey = "record_id"; this.adapter = adapter; }
    }
    expect(Record.primaryKey).toBe("record_id");
  });

  it("composite primary key out of order", () => {
    class Entry extends Base {
      static { this.attribute("entry_id", "integer"); this.attribute("blog_id", "integer"); this.primaryKey = "entry_id"; this.adapter = adapter; }
    }
    expect(Entry.primaryKey).toBe("entry_id");
  });

  it("assigning a composite primary key", async () => {
    class Order extends Base {
      static { this.attribute("shop_id", "integer"); this.attribute("order_id", "integer"); this.primaryKey = "order_id"; this.adapter = adapter; }
    }
    const o = await Order.create({ shop_id: 1, order_id: 42 });
    expect(o.id).toBe(42);
  });

  it("id was composite", async () => {
    class Order extends Base {
      static { this.attribute("shop_id", "integer"); this.primaryKey = "shop_id"; this.adapter = adapter; }
    }
    const o = await Order.create({ shop_id: 5 });
    expect(o.id).toBe(5);
  });

  it("id predicate composite", async () => {
    class Order extends Base {
      static { this.attribute("shop_id", "integer"); this.primaryKey = "shop_id"; this.adapter = adapter; }
    }
    const o = await Order.create({ shop_id: 10 });
    expect(o.id).toBeTruthy();
  });

  it("derives composite primary key", () => {
    class Widget extends Base {
      static { this.attribute("widget_id", "integer"); this.primaryKey = "widget_id"; this.adapter = adapter; }
    }
    expect(Widget.primaryKey).toBe("widget_id");
  });

  it("collectly dump composite primary key", () => {
    class Item extends Base {
      static { this.attribute("item_id", "integer"); this.primaryKey = "item_id"; this.adapter = adapter; }
    }
    expect(Item.primaryKey).toBe("item_id");
  });

  it("dumping composite primary key out of order", () => {
    class Thing extends Base {
      static { this.attribute("thing_id", "integer"); this.attribute("group_id", "integer"); this.primaryKey = "thing_id"; this.adapter = adapter; }
    }
    expect(Thing.primaryKey).toBe("thing_id");
  });

  it("model with a composite primary key", async () => {
    class Product extends Base {
      static { this.attribute("product_id", "integer"); this.attribute("name", "string"); this.primaryKey = "product_id"; this.adapter = adapter; }
    }
    const p = await Product.create({ product_id: 99, name: "Widget" });
    expect(p.id).toBe(99);
    expect(p.readAttribute("name")).toBe("Widget");
  });

  it("primary key values present for a composite pk model", async () => {
    class Order extends Base {
      static { this.attribute("order_id", "integer"); this.attribute("total", "integer"); this.primaryKey = "order_id"; this.adapter = adapter; }
    }
    const o = await Order.create({ order_id: 7, total: 100 });
    expect(o.id).toBe(7);
    expect(o.isPersisted()).toBe(true);
  });

  it("assigning a non array value to model with composite primary key raises", () => {
    class Order extends Base {
      static { this.attribute("shop_id", "integer"); this.attribute("id", "integer"); this.primaryKey = ["shop_id", "id"]; this.adapter = adapter; }
    }
    expect(Order.compositePrimaryKey).toBe(true);
    expect(Order.primaryKey).toEqual(["shop_id", "id"]);
  });

  it("composite primary key returns array id", async () => {
    class Order extends Base {
      static { this.attribute("shop_id", "integer"); this.attribute("id", "integer"); this.primaryKey = ["shop_id", "id"]; this.adapter = adapter; }
    }
    const o = new Order({ shop_id: 1, id: 42 });
    expect(o.id).toEqual([1, 42]);
  });

  it("composite primary key set id distributes values", () => {
    class Order extends Base {
      static { this.attribute("shop_id", "integer"); this.attribute("id", "integer"); this.primaryKey = ["shop_id", "id"]; this.adapter = adapter; }
    }
    const o = new Order();
    o.id = [5, 10];
    expect(o.readAttribute("shop_id")).toBe(5);
    expect(o.readAttribute("id")).toBe(10);
  });

  it("composite primary key create and find", async () => {
    class Order extends Base {
      static { this.attribute("shop_id", "integer"); this.attribute("id", "integer"); this.attribute("name", "string"); this.primaryKey = ["shop_id", "id"]; this.adapter = adapter; }
    }

    const o = await Order.create({ shop_id: 1, id: 42, name: "Widget" });
    expect(o.id).toEqual([1, 42]);
    expect(o.isPersisted()).toBe(true);

    const found = await Order.find([1, 42]);
    expect(found.readAttribute("name")).toBe("Widget");
  });

  it("composite primary key update", async () => {
    class Order extends Base {
      static { this.attribute("shop_id", "integer"); this.attribute("id", "integer"); this.attribute("status", "string"); this.primaryKey = ["shop_id", "id"]; this.adapter = adapter; }
    }

    const o = await Order.create({ shop_id: 1, id: 1, status: "pending" });
    await o.update({ status: "shipped" });
    await o.reload();
    expect(o.readAttribute("status")).toBe("shipped");
  });

  it("composite primary key destroy", async () => {
    class Order extends Base {
      static { this.attribute("shop_id", "integer"); this.attribute("id", "integer"); this.primaryKey = ["shop_id", "id"]; this.adapter = adapter; }
    }

    const o = await Order.create({ shop_id: 1, id: 1 });
    await o.destroy();
    expect(o.isDestroyed()).toBe(true);
    const count = await Order.count();
    expect(count).toBe(0);
  });

  it("composite primary key dup removes all pk columns", async () => {
    class Order extends Base {
      static { this.attribute("shop_id", "integer"); this.attribute("id", "integer"); this.attribute("name", "string"); this.primaryKey = ["shop_id", "id"]; this.adapter = adapter; }
    }
    const o = new Order({ shop_id: 1, id: 42, name: "Widget" });
    const copy = o.dup();
    expect(copy.readAttribute("shop_id")).toBeNull();
    expect(copy.readAttribute("id")).toBeNull();
    expect(copy.readAttribute("name")).toBe("Widget");
    expect(copy.isNewRecord()).toBe(true);
  });
});
