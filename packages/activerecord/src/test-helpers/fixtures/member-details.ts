import { ref } from "../../fixtures.js";

export const memberDetailFixtureData = {
  groucho: {
    id: 1,
    member_id: ref("members", "groucho"),
    organization_id: ref("organizations", "nsa"),
  },
  some_other_guy: {
    id: 2,
    member_id: ref("members", "some_other_guy"),
    organization_id: ref("organizations", "nsa"),
  },
};
