import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/cpk_order_tags.yml
export const cpkOrderTagFixtureData = {
  cpk_first_order_loyal_customer: {
    tag_id: ref("cpk_tags", "cpk_tag_loyal_customer"),
    order_id: ref("cpk_orders", "cpk_groceries_order_1"),
  },
  cpk_second_order_loyal_customer: {
    tag_id: ref("cpk_tags", "cpk_tag_loyal_customer"),
    order_id: ref("cpk_orders", "cpk_groceries_order_2"),
  },
  cpk_first_order_digital_product: {
    tag_id: ref("cpk_tags", "cpk_tag_digital_product"),
    order_id: ref("cpk_orders", "cpk_groceries_order_1"),
  },
};
