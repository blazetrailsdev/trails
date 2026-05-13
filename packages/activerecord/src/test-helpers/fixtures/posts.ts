import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/posts.yml
export const postFixtureData = {
  welcome: {
    title: "Welcome to the weblog",
    body: "Such a lovely day",
    type: "Post",
    author_id: ref("authors", "david"),
  },
  thinking: {
    title: "So I was thinking",
    body: "like I hopefully always am",
    type: "Post",
    author_id: ref("authors", "david"),
  },
  sti_comments: {
    title: "A test of aggregates",
    body: "a post with many comments of different types",
    type: "Post",
    author_id: ref("authors", "david"),
  },
};
