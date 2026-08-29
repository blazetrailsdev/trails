import { ref } from "../../fixtures.js";

export const cpkOrderAgreementFixtureData = {
  order_agreement_one: {
    signature: "abc123",
  },
  order_agreement_two: {
    signature: "xyz789",
  },
  order_agreement_three: {
    order_id: ref("cpk_orders", "cpk_groceries_order_2"),
    signature: "def321",
  },
};
