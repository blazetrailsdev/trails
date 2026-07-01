// activerecord/test/fixtures/cpk_orders.yml
//
// Rails' cpk_orders.yml omits shop_id — the table is composite-PK `[shop_id,
// id]` and `FixtureSet.composite_identify` fills both key columns from the
// label. Our test schema keeps cpk_orders on a single autoincrement `id` (see
// test-schema.ts) because the fixture loader can't yet resolve a `ref()` to a
// composite target's `id` column, so shop_id is pinned here to keep the
// composite delete/update subquery tuple non-NULL. The values mirror Rails'
// logical shop assignment (grocery shop 1, coffee shop 2). Tracked for full
// convergence in RFC 0023 cpk-composite-fixture-ref-resolution.
export const cpkOrderFixtureData = {
  cpk_groceries_order_1: {
    shop_id: 1,
    status: "paid",
  },
  cpk_groceries_order_2: {
    shop_id: 2,
    status: "paid",
  },
  cpk_coffee_order_1: {
    shop_id: 2,
    status: "cancelled",
  },
};
