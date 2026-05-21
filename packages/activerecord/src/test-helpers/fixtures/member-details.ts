import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/member_details.yml
// Rails YAML uses the association name `organization:` (belongs_to
// :organization); translated to the FK column `organization_id` for
// loadability against the schema.
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
