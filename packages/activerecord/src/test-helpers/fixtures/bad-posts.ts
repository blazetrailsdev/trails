import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/bad_posts.yml
// Rails sets `_fixture: model_class: BadPostModel`; load with set_fixture_class.
export const badPostFixtureData = {
  bad_welcome: {
    author_id: ref("authors", "david"),
    title: "Welcome to the another weblog",
    body: "It's really nice today",
  },
};
