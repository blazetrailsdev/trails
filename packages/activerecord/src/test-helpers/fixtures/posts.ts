import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/posts.yml
export const postFixtureData = {
  welcome: {
    title: "Welcome to the weblog",
    body: "Such a lovely day",
    type: "Post",
    author_id: ref("authors", "david"),
    legacy_comments_count: 2,
    tags_count: 1,
  },
  thinking: {
    title: "So I was thinking",
    body: "Like I hopefully always am",
    type: "SpecialPost",
    author_id: ref("authors", "david"),
    legacy_comments_count: 1,
    tags_count: 1,
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
    legacy_comments_count: 5,
  },
  sti_post_and_comments: {
    title: "sti me",
    body: "hello",
    type: "StiPost",
    author_id: ref("authors", "david"),
    legacy_comments_count: 2,
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
    legacy_comments_count: 1,
    tags_count: 3,
  },
  misc_by_bob: {
    title: "misc post by bob",
    body: "hello",
    type: "Post",
    author_id: ref("authors", "bob"),
    tags_count: 1,
  },
  misc_by_mary: {
    title: "misc post by mary",
    body: "hullo",
    type: "Post",
    author_id: ref("authors", "mary"),
    tags_count: 1,
  },
  other_by_bob: {
    title: "other post by bob",
    body: "hello",
    type: "Post",
    author_id: ref("authors", "bob"),
    tags_count: 1,
  },
  other_by_mary: {
    title: "other post by mary",
    body: "hello",
    type: "Post",
    author_id: ref("authors", "mary"),
    tags_count: 1,
  },
};
