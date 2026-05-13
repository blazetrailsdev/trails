import { ref } from "../define-fixtures.js";

/**
 * Canonical fixture data for the Rails `comments` table.
 * Mirrors activerecord/test/fixtures/comments.yml.
 * Use via defineFixtures(adapter, Comment, commentFixtureData).
 */
export const commentFixtureData = {
  greetings: {
    body: "Thank you for the welcome",
    post_id: ref("posts", "welcome"),
    type: "Comment",
  },
  more_greetings: {
    body: "Hello my friend!",
    post_id: ref("posts", "welcome"),
    type: "Comment",
  },
  does_it_hurt: {
    body: "Don't think too hard about it",
    post_id: ref("posts", "thinking"),
    type: "Comment",
  },
};
