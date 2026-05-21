import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/cpk_order_agreements.yml
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
