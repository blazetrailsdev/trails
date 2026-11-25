import { Schema } from "@blazetrails/activerecord";
import type { SQLite3Adapter } from "@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js";

await Schema.get(8).define<SQLite3Adapter>({ version: 2026_01_01_000004 }, async (ctx) => {
  await ctx.createTable("follows", { force: "cascade" }, (t) => {
    t.integer("follower_id");
    t.integer("followee_id");
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
    t.index(["follower_id", "followee_id"], {
      name: "index_follows_on_follower_id_and_followee_id",
      unique: true,
    });
  });

  await ctx.createTable("likes", { force: "cascade" }, (t) => {
    t.integer("user_id");
    t.integer("tweet_id");
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
    t.index(["user_id", "tweet_id"], { name: "index_likes_on_user_id_and_tweet_id", unique: true });
  });

  await ctx.createTable("tweets", { force: "cascade" }, (t) => {
    t.integer("user_id");
    t.text("body");
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
  });

  await ctx.createTable("users", { force: "cascade" }, (t) => {
    t.string("handle");
    t.string("display_name");
    t.string("bio");
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
    t.index(["handle"], { name: "index_users_on_handle", unique: true });
  });
});
