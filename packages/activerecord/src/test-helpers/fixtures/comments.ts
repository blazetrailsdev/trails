import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/comments.yml
export const commentFixtureData = {
  greetings: {
    id: 1,
    body: "Thank you for the welcome",
    post_id: ref("posts", "welcome"),
    type: "Comment",
  },
  more_greetings: {
    id: 2,
    body: "Thank you again for the welcome",
    post_id: ref("posts", "welcome"),
    parent_id: ref("comments", "greetings"),
    type: "Comment",
  },
  does_it_hurt: {
    id: 3,
    body: "Don't think too hard",
    post_id: ref("posts", "thinking"),
    type: "SpecialComment",
  },
  eager_sti_on_associations_vs_comment: {
    id: 5,
    body: "Very Special type",
    post_id: ref("posts", "sti_comments"),
    type: "VerySpecialComment",
  },
  eager_sti_on_associations_s_comment1: {
    id: 6,
    body: "Special type",
    post_id: ref("posts", "sti_comments"),
    type: "SpecialComment",
  },
  eager_sti_on_associations_s_comment2: {
    id: 7,
    body: "Special type 2",
    post_id: ref("posts", "sti_comments"),
    type: "SpecialComment",
  },
  eager_sti_on_associations_comment: {
    id: 8,
    body: "Normal type",
    post_id: ref("posts", "sti_comments"),
    type: "Comment",
  },
  check_eager_sti_on_associations: {
    id: 9,
    body: "Normal type",
    post_id: ref("posts", "sti_post_and_comments"),
    type: "Comment",
  },
  check_eager_sti_on_associations2: {
    id: 10,
    body: "Special Type",
    post_id: ref("posts", "sti_post_and_comments"),
    type: "SpecialComment",
  },
  eager_other_comment1: {
    id: 11,
    body: "go wild",
    post_id: ref("posts", "eager_other"),
    type: "SpecialComment",
  },
  sub_special_comment: {
    id: 12,
    body: "Sub special comment",
    post_id: ref("posts", "sti_comments"),
    type: "SubSpecialComment",
  },
  recursive_association_comment: {
    id: 13,
    body: "afrase",
    post_id: ref("posts", "sti_post_and_comments"),
    type: "Comment",
    company: ref("companies", "recursive_association_fk"),
  },
};
