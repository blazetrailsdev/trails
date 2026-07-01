// activerecord/test/fixtures/cpk_orders.yml
//
// Rails' cpk_orders.yml omits shop_id: the table is a plain autoincrement `id`
// (schema.rb) and the composite PK lives only on the model (Cpk::Order), so
// `FixtureSet.composite_identify` — keyed on `model_class.composite_primary_key?`
// — fills shop_id from the label. Our fixture loader keys the composite fill on
// the schema pk, so it never fills shop_id; the shop_id values below are a
// trails-only bridge (arbitrary non-NULL integers, NOT Rails fixture data) so
// the composite delete/update subquery tuple `(shop_id, id) IN (…)` is not NULL.
// Tracked for full convergence — filling shop_id label-derived like Rails — in
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
