import { ref } from "../../fixtures.js";

export const badPostFixtureData = {
  bad_welcome: {
    author_id: ref("authors", "david"),
    title: "Welcome to the another weblog",
    body: "It's really nice today",
  },
};
