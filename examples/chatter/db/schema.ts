// This file is auto-generated from the current state of the database. Instead
// of editing this file, please use the migrations feature of Active Record to
// incrementally modify your database, and then regenerate this schema definition.
//
// This file is the source Trails uses to define your schema when running `bin/trails
// db:schema:load`. When creating a new database, `bin/trails db:schema:load` tends to
// be faster and is potentially less error prone than running all of your
// migrations from scratch. Old migrations may fail to apply correctly if those
// migrations use external dependencies or application code.
//
// It's strongly recommended that you check this file into your version control system.

import { Schema } from "@blazetrails/activerecord";
import type { Mysql2Adapter } from "@blazetrails/activerecord/connection-adapters/mysql2-adapter.js";

await Schema.get(8).define<Mysql2Adapter>({ version: 2026_11_22_213923 }, async (ctx) => {
  await ctx.createTable(
    "active_storage_attachments",
    { charset: "utf8mb4", collation: "utf8mb4_0900_ai_ci", force: "cascade" },
    (t) => {
      t.string("name", { null: false });
      t.string("record_type", { null: false });
      t.bigint("record_id", { null: false });
      t.bigint("blob_id", { null: false });
      t.datetime("created_at", { null: false });
      t.index(["blob_id"], { name: "index_active_storage_attachments_on_blob_id" });
      t.index(["record_type", "record_id", "name", "blob_id"], {
        name: "index_active_storage_attachments_uniqueness",
        unique: true,
      });
    },
  );

  await ctx.createTable(
    "active_storage_blobs",
    { charset: "utf8mb4", collation: "utf8mb4_0900_ai_ci", force: "cascade" },
    (t) => {
      t.string("key", { null: false });
      t.string("filename", { null: false });
      t.string("content_type");
      t.text("metadata");
      t.string("service_name", { null: false });
      t.bigint("byte_size", { null: false });
      t.string("checksum");
      t.datetime("created_at", { null: false });
      t.index(["key"], { name: "index_active_storage_blobs_on_key", unique: true });
    },
  );

  await ctx.createTable(
    "active_storage_variant_records",
    { charset: "utf8mb4", collation: "utf8mb4_0900_ai_ci", force: "cascade" },
    (t) => {
      t.bigint("blob_id", { null: false });
      t.string("variation_digest", { null: false });
      t.index(["blob_id", "variation_digest"], {
        name: "index_active_storage_variant_records_uniqueness",
        unique: true,
      });
    },
  );

  await ctx.createTable(
    "link_previews",
    { charset: "utf8mb4", collation: "utf8mb4_0900_ai_ci", force: "cascade" },
    (t) => {
      t.bigint("message_id", { null: false });
      t.string("url", { null: false });
      t.string("title");
      t.text("description");
      t.string("image_url");
      t.string("site_name");
      t.datetime("created_at", { null: false });
      t.datetime("updated_at", { null: false });
      t.index(["message_id"], { name: "index_link_previews_on_message_id" });
    },
  );

  await ctx.createTable(
    "memberships",
    { charset: "utf8mb4", collation: "utf8mb4_0900_ai_ci", force: "cascade" },
    (t) => {
      t.bigint("room_id", { null: false });
      t.bigint("user_id", { null: false });
      t.datetime("last_read_at");
      t.datetime("created_at", { null: false });
      t.datetime("updated_at", { null: false });
      t.index(["room_id", "user_id"], {
        name: "index_memberships_on_room_id_and_user_id",
        unique: true,
      });
      t.index(["room_id"], { name: "index_memberships_on_room_id" });
      t.index(["user_id"], { name: "index_memberships_on_user_id" });
    },
  );

  await ctx.createTable(
    "messages",
    { charset: "utf8mb4", collation: "utf8mb4_0900_ai_ci", force: "cascade" },
    (t) => {
      t.bigint("room_id", { null: false });
      t.bigint("user_id", { null: false });
      t.bigint("parent_id");
      t.text("body");
      t.integer("replies_count", { default: 0, null: false });
      t.datetime("created_at", { null: false });
      t.datetime("updated_at", { null: false });
      t.index(["parent_id"], { name: "index_messages_on_parent_id" });
      t.index(["room_id"], { name: "index_messages_on_room_id" });
      t.index(["user_id"], { name: "index_messages_on_user_id" });
    },
  );

  await ctx.createTable(
    "reactions",
    { charset: "utf8mb4", collation: "utf8mb4_0900_ai_ci", force: "cascade" },
    (t) => {
      t.bigint("message_id", { null: false });
      t.bigint("user_id", { null: false });
      t.string("emoji", { null: false });
      t.datetime("created_at", { null: false });
      t.datetime("updated_at", { null: false });
      t.index(["message_id", "user_id", "emoji"], {
        name: "index_reactions_on_message_id_and_user_id_and_emoji",
        unique: true,
      });
      t.index(["message_id"], { name: "index_reactions_on_message_id" });
      t.index(["user_id"], { name: "index_reactions_on_user_id" });
    },
  );

  await ctx.createTable(
    "rooms",
    { charset: "utf8mb4", collation: "utf8mb4_0900_ai_ci", force: "cascade" },
    (t) => {
      t.string("name");
      t.string("kind", { default: "channel", null: false });
      t.string("topic");
      t.bigint("creator_id", { null: false });
      t.datetime("created_at", { null: false });
      t.datetime("updated_at", { null: false });
      t.index(["creator_id"], { name: "index_rooms_on_creator_id" });
      t.index(["kind", "name"], { name: "index_rooms_on_kind_and_name", unique: true });
    },
  );

  await ctx.createTable(
    "sessions",
    { charset: "utf8mb4", collation: "utf8mb4_0900_ai_ci", force: "cascade" },
    (t) => {
      t.bigint("user_id", { null: false });
      t.string("ip_address");
      t.string("user_agent");
      t.datetime("created_at", { null: false });
      t.datetime("updated_at", { null: false });
      t.index(["user_id"], { name: "index_sessions_on_user_id" });
    },
  );

  await ctx.createTable(
    "users",
    { charset: "utf8mb4", collation: "utf8mb4_0900_ai_ci", force: "cascade" },
    (t) => {
      t.string("email_address", { null: false });
      t.string("name");
      t.datetime("created_at", { null: false });
      t.datetime("updated_at", { null: false });
      t.index(["email_address"], { name: "index_users_on_email_address", unique: true });
    },
  );

  await ctx.addForeignKey("active_storage_attachments", "active_storage_blobs", {
    column: "blob_id",
  });
  await ctx.addForeignKey("active_storage_variant_records", "active_storage_blobs", {
    column: "blob_id",
  });
  await ctx.addForeignKey("link_previews", "messages");
  await ctx.addForeignKey("memberships", "rooms");
  await ctx.addForeignKey("memberships", "users");
  await ctx.addForeignKey("messages", "messages", { column: "parent_id" });
  await ctx.addForeignKey("messages", "rooms");
  await ctx.addForeignKey("messages", "users");
  await ctx.addForeignKey("reactions", "messages");
  await ctx.addForeignKey("reactions", "users");
  await ctx.addForeignKey("rooms", "users", { column: "creator_id" });
  await ctx.addForeignKey("sessions", "users");
});
