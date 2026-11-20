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

await Schema.get(8).define<SQLite3Adapter>({ version: 2026_11_20_120100 }, async (ctx) => {
  await ctx.createTable("notebooks", { force: "cascade" }, (t) => {
    t.string("name", { null: false });
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
  });

  await ctx.createTable("notes", { force: "cascade" }, (t) => {
    t.integer("notebook_id", { null: false });
    t.string("title", { null: false });
    t.text("body");
    t.boolean("pinned", { default: false, null: false });
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
    t.index(["notebook_id"], { name: "index_notes_on_notebook_id" });
  });

  await ctx.addForeignKey("notes", "notebooks");
});
