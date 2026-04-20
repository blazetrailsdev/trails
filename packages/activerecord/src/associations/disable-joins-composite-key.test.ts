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
import { DisableJoinsAssociationRelation } from "../disable-joins-association-relation.js";
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
    // NOTE: the test name is preserved from PR #645 (test names are
    // an identifier in this repo — `test:compare` uses them to match
    // against Rails). The body now asserts the *new* behavior: the
    // loaded-chain DJAR wrap supports composite keys via serialized
    // tuple grouping, so when the through-step is ordered (upstream
    // `.order("name")` yields orderA before orderB) the source
    // step's records re-emit in that tuple order regardless of the
    // DB's own insertion / default order.
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
    // orderA sorts before orderB by `name`, so the wrap yields
    // `from-a` before `from-b` even though `from-b` was inserted first.
    expect(items.map((i: any) => i.sku)).toEqual(["from-a", "from-b"]);
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

    // Two independently-read `[shop.id, 200]` tuples + B-before-A
    // ordering. Without tuple dedupe + grouping, the duplicate would
    // double-count or the Map would bucket by reference and miss
    // both records.
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
    // Regression: `big_integer`-cast PKs produce bigints, and
    // JSON.stringify throws on bigint. The serializer must normalize
    // them before hashing so composite-key dedupe/group-by can't
    // crash when a tuple component is a bigint.
    const djar = new DisableJoinsAssociationRelation(
      CkLineItem,
      ["ck_order_shop_id", "ck_order_number"],
      [
        [1n, 100n],
        [1n, 100n],
      ],
    );
    expect(await djar.ids()).toEqual([[1n, 100n]]);
    // The empty result matters less than the fact that bigint tuple
    // components don't make construction, ids(), or toArray() throw.
    await expect(djar.toArray()).resolves.toEqual([]);
  });

  it("DisableJoinsAssociationRelation key normalization: empty array throws, single-element array collapses to string", async () => {
    // length 0 is always a bug — the load/reorder path would call
    // readAttribute(undefined) and misbehave.
    expect(() => new DisableJoinsAssociationRelation(CkLineItem, [] as any, [])).toThrow(
      /at least one column/,
    );
    // Empty-string key in loaded-chain mode would make
    // readAttribute("") return null and silently empty the reorder.
    // `deferred()` uses "" as a placeholder so the guard only fires
    // when no chainWalker is present.
    expect(() => new DisableJoinsAssociationRelation(CkLineItem, "", [1])).toThrow(
      /key must not be empty/,
    );
    // length 1 is equivalent to the string form; normalize so
    // `this.key` / `_composite` stay consistent with the scalar path.
    // The correlated overloads pair `string[]` with `unknown[][]`, so
    // the length-1 case is exercised through the tuple-ids route and
    // the constructor's singleton-tuple flattening (`[[1], [2]]` →
    // `[1, 2]`).
    const djarTuples = new DisableJoinsAssociationRelation(CkLineItem, ["sku"], [["a"], ["b"]]);
    expect(djarTuples.key).toBe("sku");
    expect(await djarTuples.ids()).toEqual(["a", "b"]);

    // A non-singleton tuple under a length-1 key is a caller bug —
    // without the guard it would silently route through the scalar
    // path with an array id that can never match scalar record
    // attributes, dropping all loaded records. Fail fast.
    expect(
      () =>
        new DisableJoinsAssociationRelation(CkLineItem, ["sku"], [
          [1, 2],
        ] as unknown as unknown[][]),
    ).toThrow(/single-element array/);

    // Scalar-key + tuple-ids via dynamic `any` erasure: Set dedup
    // would keep arrays by reference and the Map lookup on load
    // would never match a scalar record attribute, silently
    // yielding an empty ordering. Guard fails fast instead.
    expect(() => new DisableJoinsAssociationRelation(CkLineItem, "sku", [[1], [2]] as any)).toThrow(
      /must not be an array/,
    );

    // Non-array `ids` via dynamic erasure — without the early guard
    // `.map` / `.length` below would throw a generic TypeError or
    // silently store zero ids.
    expect(
      () => new DisableJoinsAssociationRelation(CkLineItem, "sku", new Set(["a"]) as any),
    ).toThrow(/ids must be an array/);
    expect(() => new DisableJoinsAssociationRelation(CkLineItem, "sku", null as any)).toThrow(
      /ids must be an array/,
    );

    // ids() returns a defensive copy — caller mutation of the
    // returned list or its tuples must not desync the internal
    // `_storedKeyStrings` cache (which the load-time reorder uses).
    const djar = new DisableJoinsAssociationRelation(
      CkLineItem,
      ["ck_order_shop_id", "ck_order_number"],
      [[1, 100]],
    );
    const returned = (await djar.ids()) as unknown[][];
    returned.push([999, 999]);
    (returned[0] as unknown[])[1] = 42;
    // Second call sees the original — mutation didn't leak into
    // the DJAR's internal state.
    expect(await djar.ids()).toEqual([[1, 100]]);
  });

  it("DisableJoinsAssociationRelation composite-key load: throws ArgumentError on shape/arity mismatch", async () => {
    // Fail-fast on caller bugs. Without the guard, a flat scalar list
    // would silently dedupe to "one bucket per scalar" and reorder to
    // nothing.
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
    // Regression: when PredicateBuilder.buildComposite short-circuits
    // to `Relation#none()` (empty tuples / all-null), the DJAR wrap
    // would previously copy `_whereClause.predicates` but drop
    // `_isNone`, producing a full-table SELECT. The scope itself is
    // already a never-match, so DJAS now returns it directly.
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
    // No orders — through step plucks nothing, final step gets
    // composite `where([...], [])` which PredicateBuilder resolves to
    // none().
    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      const sql = event?.payload?.sql;
      if (typeof sql === "string" && /\bFROM\b\s+["`]?ck_line_items\b/i.test(sql)) {
        observed.push(sql);
      }
    });
    try {
      const reflection = (CkShop as any)._reflectOnAssociation("ckLineItemsEmpty");
      const items = await loadHasMany(shop, "ckLineItemsEmpty", reflection.options);
      expect(items).toEqual([]);
    } finally {
      Notifications.unsubscribe(sub);
    }
    // The none() short-circuit means no SELECT against ck_line_items
    // at all. A full-table scan (regression) would show at least one.
    expect(observed).toEqual([]);
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
