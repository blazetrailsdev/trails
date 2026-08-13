// This file is auto-generated from the current state of the database.
// Instead of editing this file, please use the migrations feature.

import type { DatabaseAdapter } from "@blazetrails/activerecord";

export default async function defineSchema(ctx: DatabaseAdapter) {
  await ctx.createTable("follows", { force: "cascade" }, (t) => {
    t.integer("follower_id");
    t.integer("followee_id");
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
  });
  await ctx.addIndex("follows", ["follower_id", "followee_id"], {
    name: "index_follows_on_follower_id_and_followee_id",
    unique: true,
  });

  await ctx.createTable("hashtags", { force: "cascade" }, (t) => {
    t.string("name");
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
  });
  await ctx.addIndex("hashtags", "name", { name: "index_hashtags_on_name", unique: true });

  await ctx.createTable("hashtags_tweets", { id: false, force: "cascade" }, (t) => {
    t.integer("hashtag_id", { null: false });
    t.integer("tweet_id", { null: false });
  });
  await ctx.addIndex("hashtags_tweets", ["hashtag_id", "tweet_id"], {
    name: "index_hashtags_tweets_on_hashtag_id_and_tweet_id",
    unique: true,
  });

  await ctx.createTable("likes", { force: "cascade" }, (t) => {
    t.integer("user_id");
    t.integer("tweet_id");
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
  });
  await ctx.addIndex("likes", ["user_id", "tweet_id"], {
    name: "index_likes_on_user_id_and_tweet_id",
    unique: true,
  });

  await ctx.createTable("tweets", { force: "cascade" }, (t) => {
    t.integer("user_id");
    t.text("body");
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
    t.integer("likes_count", { default: 0, null: false });
    t.integer("replies_count", { default: 0, null: false });
    t.integer("reply_to_id");
    t.integer("visibility", { default: 0, null: false });
  });
  await ctx.addIndex("tweets", "reply_to_id", { name: "index_tweets_on_reply_to_id" });
  await ctx.addIndex("tweets", "user_id", { name: "index_tweets_on_user_id" });

  await ctx.createTable("users", { force: "cascade" }, (t) => {
    t.string("handle");
    t.string("display_name");
    t.string("bio");
    t.string("password_digest");
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
    t.integer("tweets_count", { default: 0, null: false });
  });
  await ctx.addIndex("users", "handle", { name: "index_users_on_handle", unique: true });

  await ctx.addForeignKey("tweets", "users");
}
