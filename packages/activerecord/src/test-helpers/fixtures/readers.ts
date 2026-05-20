import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/readers.yml
// person_id: 4 has no matching row in people.yml — kept as literal to mirror Rails.
export const readerFixtureData = {
  michael_welcome: {
    id: 1,
    post_id: ref("posts", "welcome"),
    person_id: ref("people", "michael"),
    first_post_id: ref("posts", "thinking"),
  },
  michael_authorless: {
    id: 2,
    post_id: ref("posts", "authorless"),
    person_id: ref("people", "michael"),
    first_post_id: ref("posts", "authorless"),
  },
  bob_welcome: {
    id: 3,
    post_id: ref("posts", "misc_by_bob"),
    person_id: 4,
    first_post_id: ref("posts", "other_by_bob"),
  },
};
