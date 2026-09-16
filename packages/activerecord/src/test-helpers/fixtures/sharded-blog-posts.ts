import { FixtureSet } from "../../fixtures.js";

export const shardedBlogPostFixtureData = {
  great_post_blog_one: {
    title: "My first post in my Blog1!",
    blog_id: FixtureSet.identify("sharded_blog_one"),
  },
  second_post_blog_one: {
    title: "This is my second post in my Blog1!",
    blog_id: FixtureSet.identify("sharded_blog_one"),
  },
  great_post_blog_two: {
    title: "My first post in my Blog2!",
    blog_id: FixtureSet.identify("sharded_blog_two"),
  },
};
