import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/categories_posts.yml
// HABTM join — Rails sets `_fixture: model_class: Post::CategoryPost`; ports omit metadata rows.
export const categoriesPostsFixtureData = {
  general_welcome: {
    category_id: ref("categories", "general"),
    post_id: ref("posts", "welcome"),
  },
  technology_welcome: {
    category_id: ref("categories", "technology"),
    post_id: ref("posts", "welcome"),
  },
  general_thinking: {
    category_id: ref("categories", "general"),
    post_id: ref("posts", "thinking"),
  },
  general_sti_habtm: {
    category_id: ref("categories", "general"),
    post_id: ref("posts", "sti_habtm"),
  },
  sti_test_sti_habtm: {
    category_id: ref("categories", "sti_test"),
    post_id: ref("posts", "sti_habtm"),
  },
  general_hello: {
    category_id: ref("categories", "general"),
    post_id: ref("posts", "sti_comments"),
  },
  general_misc_by_bob: {
    category_id: ref("categories", "general"),
    post_id: ref("posts", "misc_by_bob"),
  },
  cooking_misc_by_bob: {
    category_id: ref("categories", "cooking"),
    post_id: ref("posts", "misc_by_bob"),
  },
};
