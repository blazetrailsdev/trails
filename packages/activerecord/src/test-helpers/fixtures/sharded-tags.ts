import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/sharded_tags.yml
export const shardedTagFixtureData = {
  short_read_blog_one: {
    name: "short read",
    blog_id: ref("sharded_blogs", "sharded_blog_one"),
  },
  long_read_blog_one: {
    name: "long read",
    blog_id: ref("sharded_blogs", "sharded_blog_one"),
  },
  technical_blog_one: {
    name: "tech",
    blog_id: ref("sharded_blogs", "sharded_blog_one"),
  },
  time_management_blog_one: {
    name: "time management",
    blog_id: ref("sharded_blogs", "sharded_blog_one"),
  },
  beginner_blog_two: {
    name: "for beginners",
    blog_id: ref("sharded_blogs", "sharded_blog_two"),
  },
  intermediate_blog_two: {
    name: "for intermediate",
    blog_id: ref("sharded_blogs", "sharded_blog_two"),
  },
  short_read_blog_two: {
    name: "short read",
    blog_id: ref("sharded_blogs", "sharded_blog_two"),
  },
  breaking_news_blog_2: {
    name: "breaking news",
    blog_id: ref("sharded_blogs", "sharded_blog_two"),
  },
};
