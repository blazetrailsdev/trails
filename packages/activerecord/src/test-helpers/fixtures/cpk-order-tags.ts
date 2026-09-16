import { FixtureSet } from "../../fixtures.js";

export const cpkOrderTagFixtureData = {
  cpk_first_order_loyal_customer: {
    tag_id: FixtureSet.identify("cpk_tag_loyal_customer"),
    order_id: FixtureSet.compositeIdentify("cpk_groceries_order_1", ["shop_id", "id"]).id,
  },
  cpk_second_order_loyal_customer: {
    tag_id: FixtureSet.identify("cpk_tag_loyal_customer"),
    order_id: FixtureSet.compositeIdentify("cpk_groceries_order_2", ["shop_id", "id"]).id,
  },
  cpk_first_order_digital_product: {
    tag_id: FixtureSet.identify("cpk_tag_digital_product"),
    order_id: FixtureSet.compositeIdentify("cpk_groceries_order_1", ["shop_id", "id"]).id,
  },
};
