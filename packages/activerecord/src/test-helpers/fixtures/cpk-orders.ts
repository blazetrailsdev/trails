// activerecord/test/fixtures/cpk_orders.yml
//
// shop_id is intentionally omitted, exactly like Rails' cpk_orders.yml: the
// composite PK lives on the model (Cpk::Order `[shop_id, id]`) and Rails fills
// shop_id from the label via FixtureSet.composite_identify. The fixture loader
// mirrors that — see defineFixtures' model-composite-PK fill — so shop_id is
// generated at load time, keeping the composite delete/update subquery tuple
// `(shop_id, id) IN (…)` non-NULL without diverging from Rails fixture data.
export const cpkOrderFixtureData = {
  cpk_groceries_order_1: {
    status: "paid",
  },
  cpk_groceries_order_2: {
    status: "paid",
  },
  cpk_coffee_order_1: {
    status: "cancelled",
  },
};
