import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/taggings.yml
export const taggingFixtureData = {
  welcome_general: {
    id: 1,
    tag_id: ref("tags", "general"),
    super_tag_id: ref("tags", "misc"),
    taggable_id: ref("posts", "welcome"),
    taggable_type: "Post",
  },
  thinking_general: {
    id: 2,
    tag_id: ref("tags", "general"),
    taggable_id: ref("posts", "thinking"),
    taggable_type: "Post",
  },
  fake: {
    id: 3,
    tag_id: ref("tags", "general"),
    taggable_id: 1,
    taggable_type: "FakeModel",
  },
  godfather: {
    id: 4,
    tag_id: ref("tags", "general"),
    taggable_id: 1,
    taggable_type: "Item",
  },
  orphaned: {
    id: 5,
    tag_id: ref("tags", "general"),
  },
  misc_post_by_bob: {
    id: 6,
    tag_id: ref("tags", "misc"),
    taggable_id: ref("posts", "misc_by_bob"),
    taggable_type: "Post",
  },
  misc_post_by_mary: {
    id: 7,
    tag_id: ref("tags", "misc"),
    taggable_id: ref("posts", "misc_by_mary"),
    taggable_type: "Post",
  },
  misc_by_bob_blue_first: {
    id: 8,
    tag_id: ref("tags", "blue"),
    taggable_id: ref("posts", "misc_by_bob"),
    taggable_type: "Post",
    comment: "first",
  },
  misc_by_bob_blue_second: {
    id: 9,
    tag_id: ref("tags", "blue"),
    taggable_id: ref("posts", "misc_by_bob"),
    taggable_type: "Post",
    comment: "second",
  },
  other_by_bob_blue: {
    id: 10,
    tag_id: ref("tags", "blue"),
    taggable_id: ref("posts", "other_by_bob"),
    taggable_type: "Post",
    comment: "first",
  },
  other_by_mary_blue: {
    id: 11,
    tag_id: ref("tags", "blue"),
    taggable_id: ref("posts", "other_by_mary"),
    taggable_type: "Post",
    comment: "first",
  },
  special_comment_rating: {
    id: 12,
    taggable_id: 2,
    taggable_type: "Rating",
  },
  normal_comment_rating: {
    id: 13,
    taggable_id: 1,
    taggable_type: "Rating",
  },
};
