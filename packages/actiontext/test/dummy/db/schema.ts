import { Schema } from "@blazetrails/activerecord";

await Schema.get(8.0).define({ version: 2019_03_17_200724 }, async (ctx) => {
  await ctx.createTable("action_text_rich_texts", { force: "cascade" }, (t) => {
    t.string("name", { null: false });
    t.text("body");
    t.string("record_type", { null: false });
    t.integer("record_id", { null: false });
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
    t.index(["record_type", "record_id", "name"], {
      name: "index_action_text_rich_texts_uniqueness",
      unique: true,
    });
  });

  await ctx.createTable("active_storage_attachments", { force: "cascade" }, (t) => {
    t.string("name", { null: false });
    t.string("record_type", { null: false });
    t.integer("record_id", { null: false });
    t.integer("blob_id", { null: false });
    t.datetime("created_at", { precision: null, null: false });
    t.index(["blob_id"], { name: "index_active_storage_attachments_on_blob_id" });
    t.index(["record_type", "record_id", "name", "blob_id"], {
      name: "index_active_storage_attachments_uniqueness",
      unique: true,
    });
  });

  await ctx.createTable("active_storage_blobs", { force: "cascade" }, (t) => {
    t.string("key", { null: false });
    t.string("filename", { null: false });
    t.string("content_type");
    t.text("metadata");
    t.string("service_name", { null: false });
    t.bigint("byte_size", { null: false });
    t.string("checksum", { null: false });
    t.datetime("created_at", { precision: null, null: false });
    t.index(["key"], { name: "index_active_storage_blobs_on_key", unique: true });
  });

  await ctx.createTable("active_storage_variant_records", { force: "cascade" }, (t) => {
    t.integer("blob_id", { null: false });
    t.string("variation_digest", { null: false });
    t.index(["blob_id", "variation_digest"], {
      name: "index_active_storage_variant_records_uniqueness",
      unique: true,
    });
  });

  await ctx.createTable("messages", { force: "cascade" }, (t) => {
    t.string("subject");
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
  });

  await ctx.createTable("pages", { force: "cascade" }, (t) => {
    t.string("title");
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
  });

  await ctx.createTable("people", { force: "cascade" }, (t) => {
    t.string("name");
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
  });

  await ctx.createTable("reviews", { force: "cascade" }, (t) => {
    t.integer("message_id", { null: false });
    t.string("author_name", { null: false });
    t.index(["message_id"], { name: "index_reviews_on_message_id" });
  });

  await ctx.addForeignKey("active_storage_attachments", "active_storage_blobs", {
    column: "blob_id",
  });
  await ctx.addForeignKey("active_storage_variant_records", "active_storage_blobs", {
    column: "blob_id",
  });
});
