import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/posts.yml
// Schema gap: legacy_comments_count and tags_count exist in Rails YAML and schema
// but are not declared in test-fixtures.ts Post. Add attribute() declarations when needed.
export const postFixtureData = {
  welcome: {
    title: "Welcome to the weblog",
    body: "Such a lovely day",
    type: "Post",
    author_id: ref("authors", "david"),
  },
  thinking: {
    title: "So I was thinking",
    body: "Like I hopefully always am",
    type: "SpecialPost",
    author_id: ref("authors", "david"),
  },
  authorless: {
    title: "I don't have any comments",
    body: "I just don't want to",
    type: "Post",
    author_id: 0,
  },
  sti_comments: {
    title: "sti comments",
    body: "hello",
    type: "Post",
    author_id: ref("authors", "david"),
  },
  sti_post_and_comments: {
    title: "sti me",
    body: "hello",
    type: "StiPost",
    author_id: ref("authors", "david"),
  },
  sti_habtm: {
    title: "habtm sti test",
    body: "hello",
    type: "Post",
    author_id: ref("authors", "david"),
  },
  eager_other: {
    title: "eager loading with OR'd conditions",
    body: "hello",
    type: "Post",
    author_id: ref("authors", "mary"),
  },
  misc_by_bob: {
    title: "misc post by bob",
    body: "hello",
    type: "Post",
    author_id: ref("authors", "bob"),
  },
  misc_by_mary: {
    title: "misc post by mary",
    body: "hullo",
    type: "Post",
    author_id: ref("authors", "mary"),
  },
  other_by_bob: {
    title: "other post by bob",
    body: "hello",
    type: "Post",
    author_id: ref("authors", "bob"),
  },
  other_by_mary: {
    title: "other post by mary",
    body: "hello",
    type: "Post",
    author_id: ref("authors", "mary"),
  },
};
