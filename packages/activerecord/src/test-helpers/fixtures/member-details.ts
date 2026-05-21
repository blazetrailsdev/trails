import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/member_details.yml
// YAML uses bare `organization` string (no _id); schema has `organization_id` —
// kept verbatim for byte-for-byte parity.
export const memberDetailFixtureData = {
  groucho: {
    id: 1,
    member_id: ref("members", "groucho"),
    organization: "nsa",
  },
  some_other_guy: {
    id: 2,
    member_id: ref("members", "some_other_guy"),
    organization: "nsa",
  },
};
