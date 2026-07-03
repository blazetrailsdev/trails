import { ref } from "../../define-fixtures.js";

// activerecord/test/fixtures/to_be_linked/users.yml
export const toBeLinkedUsersFixtureData = {
  david: {
    name: "David",
    account_id: ref("to_be_linked_accounts", "signals37"),
  },
  jamis: {
    name: "Jamis",
    account_id: ref("to_be_linked_accounts", "signals37"),
    // Rails YAML loads the `:symbol` key as a Ruby Symbol; HashWithIndifferentAccess
    // normalizes it to the plain string "symbol" via Symbol#to_s. Mirror that runtime
    // key here rather than the YAML-literal ":symbol".
    settings: { symbol: "symbol", string: "string" },
  },
};
