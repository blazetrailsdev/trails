import { ref } from "../../../fixtures.js";

export const toBeLinkedUsersFixtureData = {
  david: {
    name: "David",
    account_id: ref("to_be_linked_accounts", "signals37"),
  },
  jamis: {
    name: "Jamis",
    account_id: ref("to_be_linked_accounts", "signals37"),
    settings: { symbol: "symbol", string: "string" },
  },
};
