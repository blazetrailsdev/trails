// activerecord/test/fixtures/cpk_orders.yml
//
// Rails' cpk_orders.yml omits shop_id: the table is a plain autoincrement `id`
// (schema.rb) and the composite PK lives only on the model (Cpk::Order), so
// `FixtureSet.composite_identify` — keyed on `model_class.composite_primary_key?`
// — fills shop_id from the label. Our fixture loader keys the composite fill on
// the schema pk, so it never fills shop_id; pin it here to keep the composite
// delete/update subquery tuple non-NULL. The values mirror Rails' logical shop
// assignment (grocery shop 1, coffee shop 2). Tracked for full convergence in
// RFC 0023 cpk-composite-fixture-ref-resolution.
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
