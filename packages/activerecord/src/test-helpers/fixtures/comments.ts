import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/comments.yml
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
    post_id: ref("posts", "sti_comments"),
    type: "SpecialComment",
  },
};
