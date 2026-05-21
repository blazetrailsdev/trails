import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/other_comments.yml
// Rails sets `_fixture: model_class: Comment`. The YAML uses association-name
// shorthand `post: second_welcome`; translated to the FK column `post_id`.
// The target loads into the `posts` table (other_posts is itself
// `_fixture.model_class: Post`), so the ref uses tableName `posts`.
export const otherCommentFixtureData = {
  second_greetings: {
    post_id: ref("posts", "second_welcome"),
    body: "Thank you for the second welcome",
  },
};
