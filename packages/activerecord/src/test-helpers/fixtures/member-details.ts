import { ref } from "../../fixtures.js";

export const memberDetailFixtureData = {
  groucho: {
    id: 1,
    member_id: 1,
    organization_id: ref("organizations", "nsa"),
  },
  some_other_guy: {
    id: 2,
    member_id: 2,
    organization_id: ref("organizations", "nsa"),
  },
};
