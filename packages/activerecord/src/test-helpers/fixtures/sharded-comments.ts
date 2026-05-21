import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/sharded_comments.yml
export const shardedCommentFixtureData = {
  great_comment_blog_post_one: {
    body: "I really enjoyed the post!",
    blog_post_id: ref("sharded_blog_posts", "great_post_blog_one"),
    blog_id: ref("sharded_blogs", "sharded_blog_one"),
  },
  wow_comment_blog_post_one: {
    body: "Wow!",
    blog_post_id: ref("sharded_blog_posts", "great_post_blog_one"),
    blog_id: ref("sharded_blogs", "sharded_blog_one"),
  },
  unique_comment_blog_post_one: {
    body: "Your first blog post is great!",
    blog_post_id: ref("sharded_blog_posts", "great_post_blog_one"),
    blog_id: ref("sharded_blogs", "sharded_blog_one"),
  },
  great_comment_blog_post_two: {
    body: "I really enjoyed the post!",
    blog_post_id: ref("sharded_blog_posts", "great_post_blog_two"),
    blog_id: ref("sharded_blogs", "sharded_blog_two"),
  },
};
