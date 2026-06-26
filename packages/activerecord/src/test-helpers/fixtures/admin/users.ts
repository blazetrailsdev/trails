import { ref } from "../../define-fixtures.js";

// activerecord/test/fixtures/admin/users.yml
export const adminUsersFixtureData = {
  david: {
    name: "David",
    account_id: ref("admin_accounts", "signals37"),
  },
  jamis: {
    name: "Jamis",
    account_id: ref("admin_accounts", "signals37"),
    settings: { ":symbol": "symbol", string: "string" },
  },
};
