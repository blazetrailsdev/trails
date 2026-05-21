import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/sharded_blog_posts_tags.yml
export const shardedBlogPostTagFixtureData = {
  short_read_first_post_blog_one: {
    tag_id: ref("sharded_tags", "short_read_blog_one"),
    blog_post_id: ref("sharded_blog_posts", "great_post_blog_one"),
    blog_id: ref("sharded_blogs", "sharded_blog_one"),
  },
  technical_content_first_post_blog_one: {
    tag_id: ref("sharded_tags", "technical_blog_one"),
    blog_post_id: ref("sharded_blog_posts", "great_post_blog_one"),
    blog_id: ref("sharded_blogs", "sharded_blog_one"),
  },
  short_read_second_post_blog_one: {
    tag_id: ref("sharded_tags", "short_read_blog_one"),
    blog_post_id: ref("sharded_blog_posts", "second_post_blog_one"),
    blog_id: ref("sharded_blogs", "sharded_blog_one"),
  },
  beginner_content_first_post_blog_two: {
    tag_id: ref("sharded_tags", "beginner_blog_two"),
    blog_post_id: ref("sharded_blog_posts", "great_post_blog_two"),
    blog_id: ref("sharded_blogs", "sharded_blog_two"),
  },
  short_read_first_post_blog_two: {
    tag_id: ref("sharded_tags", "short_read_blog_two"),
    blog_post_id: ref("sharded_blog_posts", "great_post_blog_two"),
    blog_id: ref("sharded_blogs", "sharded_blog_two"),
  },
};
