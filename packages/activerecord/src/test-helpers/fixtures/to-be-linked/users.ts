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
    settings: { ":symbol": "symbol", string: "string" },
  },
};
