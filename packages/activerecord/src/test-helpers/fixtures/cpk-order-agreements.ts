import { FixtureSet } from "../../fixtures.js";
import { CpkOrder } from "../models/cpk.js";

export const cpkOrderAgreementFixtureData = {
  order_agreement_one: {
    signature: "abc123",
  },
  order_agreement_two: {
    signature: "xyz789",
  },
  order_agreement_three: {
    order_id: FixtureSet.compositeIdentify("cpk_groceries_order_2", CpkOrder.primaryKey as string[])
      .id,
    signature: "def321",
  },
};
