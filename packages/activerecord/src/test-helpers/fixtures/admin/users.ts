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
    // Rails YAML loads the `:symbol` key as a Ruby Symbol; HashWithIndifferentAccess
    // then normalizes it to the plain string "symbol" via Symbol#to_s. We mirror that
    // runtime key here rather than the YAML-literal ":symbol".
    settings: { symbol: "symbol", string: "string" },
  },
};
