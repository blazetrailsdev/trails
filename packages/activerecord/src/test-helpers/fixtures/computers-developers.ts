import { ref } from "../define-fixtures.js";

// HABTM join table backing `Developer.shared_computers` (class_name: "Computer").
// Rails materializes this from `developers.yml`'s `david: { shared_computers: laptop }`
// label; trails has no YAML association loader (#2572 followup), so the join row is
// declared directly here. No synthetic id — computer_id + developer_id are the key.
export const computersDevelopersFixtureData = {
  david_laptop: {
    computer_id: ref("computers", "laptop"),
    developer_id: ref("developers", "david"),
  },
};
