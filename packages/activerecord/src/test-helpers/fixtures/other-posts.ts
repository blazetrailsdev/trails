import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/other_posts.yml
// Rails sets `_fixture: model_class: Post`.
export const otherPostFixtureData = {
  second_welcome: {
    author_id: ref("authors", "david"),
    title: "Welcome to the another weblog",
    body: "It's really nice today",
    legacy_comments_count: 1,
  },
};
