import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/ratings.yml
export const ratingFixtureData = {
  normal_comment_rating: {
    id: 1,
    comment_id: ref("comments", "eager_sti_on_associations_comment"),
    value: 1,
  },
  special_comment_rating: {
    id: 2,
    comment_id: ref("comments", "eager_sti_on_associations_s_comment1"),
    value: 1,
  },
  sub_special_comment_rating: {
    id: 3,
    comment_id: ref("comments", "sub_special_comment"),
    value: 1,
  },
};
