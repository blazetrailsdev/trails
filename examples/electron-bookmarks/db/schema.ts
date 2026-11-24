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
import type { SQLite3Adapter } from "@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js";

await Schema.get(8).define<SQLite3Adapter>({ version: 2026_11_24_090200 }, async (ctx) => {
  await ctx.createTable("attachments", { force: "cascade" }, (t) => {
    t.integer("bookmark_id", { null: false });
    t.string("path", { null: false });
    t.string("name", { null: false });
    t.bigint("byte_size");
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
    t.index(["bookmark_id"], { name: "index_attachments_on_bookmark_id" });
  });

  await ctx.createTable("bookmarks", { force: "cascade" }, (t) => {
    t.string("title", { null: false });
    t.string("url", { null: false });
    t.text("notes");
    t.datetime("read_at");
    t.datetime("remind_at");
    t.datetime("reminded_at");
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
    t.index(["url"], { name: "index_bookmarks_on_url", unique: true });
  });

  await ctx.createTable("taggings", { force: "cascade" }, (t) => {
    t.integer("bookmark_id", { null: false });
    t.integer("tag_id", { null: false });
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
    t.index(["bookmark_id", "tag_id"], {
      name: "index_taggings_on_bookmark_id_and_tag_id",
      unique: true,
    });
    t.index(["bookmark_id"], { name: "index_taggings_on_bookmark_id" });
    t.index(["tag_id"], { name: "index_taggings_on_tag_id" });
  });

  await ctx.createTable("tags", { force: "cascade" }, (t) => {
    t.string("name", { null: false });
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
    t.index(["name"], { name: "index_tags_on_name", unique: true });
  });

  await ctx.addForeignKey("attachments", "bookmarks");
  await ctx.addForeignKey("taggings", "bookmarks");
  await ctx.addForeignKey("taggings", "tags");
});
