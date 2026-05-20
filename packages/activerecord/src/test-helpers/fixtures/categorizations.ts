import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/categorizations.yml
export const categorizationFixtureData = {
  david_welcome_general: {
    id: 1,
    author_id: ref("authors", "david"),
    post_id: ref("posts", "welcome"),
    category_id: ref("categories", "general"),
  },
  mary_thinking_sti: {
    id: 2,
    author_id: ref("authors", "mary"),
    post_id: ref("posts", "thinking"),
    category_id: ref("categories", "sti_test"),
  },
  mary_thinking_general: {
    id: 3,
    author_id: ref("authors", "mary"),
    post_id: ref("posts", "thinking"),
    category_id: ref("categories", "general"),
  },
  bob_misc_by_bob_technology: {
    id: 4,
    author_id: ref("authors", "bob"),
    post_id: ref("posts", "misc_by_bob"),
    category_id: ref("categories", "technology"),
  },
};
