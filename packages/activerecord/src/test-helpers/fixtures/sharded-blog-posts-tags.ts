import { FixtureSet } from "../../fixtures.js";

export const shardedBlogPostTagFixtureData = {
  short_read_first_post_blog_one: {
    tag_id: FixtureSet.identify("short_read_blog_one"),
    blog_post_id: FixtureSet.identify("great_post_blog_one"),
    blog_id: FixtureSet.identify("sharded_blog_one"),
  },
  technical_content_first_post_blog_one: {
    tag_id: FixtureSet.identify("technical_blog_one"),
    blog_post_id: FixtureSet.identify("great_post_blog_one"),
    blog_id: FixtureSet.identify("sharded_blog_one"),
  },
  short_read_second_post_blog_one: {
    tag_id: FixtureSet.identify("short_read_blog_one"),
    blog_post_id: FixtureSet.identify("second_post_blog_one"),
    blog_id: FixtureSet.identify("sharded_blog_one"),
  },
  beginner_content_first_post_blog_two: {
    tag_id: FixtureSet.identify("beginner_blog_two"),
    blog_post_id: FixtureSet.identify("great_post_blog_two"),
    blog_id: FixtureSet.identify("sharded_blog_two"),
  },
  short_read_first_post_blog_two: {
    tag_id: FixtureSet.identify("short_read_blog_two"),
    blog_post_id: FixtureSet.identify("great_post_blog_two"),
    blog_id: FixtureSet.identify("sharded_blog_two"),
  },
};
