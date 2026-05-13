import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/accounts.yml
// Belongs to Company (firm_id FK). Schema gap: Rails schema also carries
// transactions_count (counter_cache on companies) — omitted; test-fixtures.ts
// Account only declares firm_id/credit_limit/firm_name/status.
export const accountFixtureData = {
  signals37: {
    firm_id: ref("companies", "first_firm"),
    credit_limit: 50,
    firm_name: "37signals",
    status: "active",
  },
  unknown: {
    credit_limit: 50,
  },
  rails_core_account: {
    firm_id: ref("companies", "rails_core"),
    credit_limit: 50,
    status: "suspended",
  },
  last_account: {
    firm_id: ref("companies", "first_client"),
    credit_limit: 60,
    status: "trial",
  },
  rails_core_account_2: {
    firm_id: ref("companies", "rails_core"),
    credit_limit: 55,
    status: "active",
  },
  odegy_account: {
    firm_id: ref("companies", "odegy"),
    credit_limit: 53,
    status: "trial",
  },
};
