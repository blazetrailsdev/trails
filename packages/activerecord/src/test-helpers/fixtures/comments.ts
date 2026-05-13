import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/comments.yml
// Schema gap: recursive_association_comment has company:15 in Rails YAML; company column
// is not declared in test-fixtures.ts Comment.
export const commentFixtureData = {
  greetings: {
    body: "Thank you for the welcome",
    post_id: ref("posts", "welcome"),
    type: "Comment",
  },
  more_greetings: {
    body: "Thank you again for the welcome",
    post_id: ref("posts", "welcome"),
    parent_id: ref("comments", "greetings"),
    type: "Comment",
  },
  does_it_hurt: {
    body: "Don't think too hard",
    post_id: ref("posts", "thinking"),
    type: "SpecialComment",
  },
  eager_sti_on_associations_vs_comment: {
    body: "Very Special type",
    post_id: ref("posts", "sti_comments"),
    type: "VerySpecialComment",
  },
  eager_sti_on_associations_s_comment1: {
    body: "Special type",
    post_id: ref("posts", "sti_comments"),
    type: "SpecialComment",
  },
  eager_sti_on_associations_s_comment2: {
    body: "Special type 2",
    post_id: ref("posts", "sti_comments"),
    type: "SpecialComment",
  },
  eager_sti_on_associations_comment: {
    body: "Normal type",
    post_id: ref("posts", "sti_comments"),
    type: "Comment",
  },
  check_eager_sti_on_associations: {
    body: "Normal type",
    post_id: ref("posts", "sti_post_and_comments"),
    type: "Comment",
  },
  check_eager_sti_on_associations2: {
    body: "Special Type",
    post_id: ref("posts", "sti_post_and_comments"),
    type: "SpecialComment",
  },
  eager_other_comment1: {
    body: "go wild",
    post_id: ref("posts", "eager_other"),
    type: "SpecialComment",
  },
  sub_special_comment: {
    body: "Sub special comment",
    post_id: ref("posts", "sti_comments"),
    type: "SubSpecialComment",
  },
  recursive_association_comment: {
    body: "afrase",
    post_id: ref("posts", "sti_post_and_comments"),
    type: "Comment",
  },
};
