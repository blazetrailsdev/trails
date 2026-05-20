import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/accounts.yml
// Belongs to Company (firm_id FK).
export const accountFixtureData = {
  signals37: {
    id: 1,
    firm_id: ref("companies", "first_firm"),
    credit_limit: 50,
    firm_name: "37signals",
    status: "active",
  },
  unknown: {
    id: 2,
    credit_limit: 50,
  },
  rails_core_account: {
    id: 3,
    firm_id: ref("companies", "rails_core"),
    credit_limit: 50,
    status: "suspended",
  },
  last_account: {
    id: 4,
    firm_id: ref("companies", "first_client"),
    credit_limit: 60,
    status: "trial",
  },
  rails_core_account_2: {
    id: 5,
    firm_id: ref("companies", "rails_core"),
    credit_limit: 55,
    status: "active",
  },
  odegy_account: {
    id: 6,
    firm_id: ref("companies", "odegy"),
    credit_limit: 53,
    status: "trial",
  },
};
