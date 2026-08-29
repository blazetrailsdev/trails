import { ref } from "../../fixtures.js";

export const otherPostFixtureData = {
  second_welcome: {
    author_id: ref("authors", "david"),
    title: "Welcome to the another weblog",
    body: "It's really nice today",
    legacy_comments_count: 1,
  },
};
