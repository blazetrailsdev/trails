import type { MigrationContext } from "@blazetrails/activerecord";

export default async function defineSchema(ctx: MigrationContext) {
  await ctx.createTable("follows", { force: "cascade" }, (t) => {
    t.integer("follower_id");
    t.integer("followee_id");
    t.timestamps();
  });
  await ctx.createTable("likes", { force: "cascade" }, (t) => {
    t.integer("user_id");
    t.integer("tweet_id");
    t.timestamps();
  });
  await ctx.createTable("tweets", { force: "cascade" }, (t) => {
    t.integer("user_id");
    t.text("body");
    t.timestamps();
  });
  await ctx.createTable("users", { force: "cascade" }, (t) => {
    t.string("handle");
    t.string("display_name");
    t.string("bio");
    t.timestamps();
  });
}
