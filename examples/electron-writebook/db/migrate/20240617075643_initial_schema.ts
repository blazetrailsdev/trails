import { Migration } from "@blazetrails/activerecord";

export class InitialSchema extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createTable("accesses", { force: "cascade" }, (t) => {
      t.integer("user_id", { null: false });
      t.integer("book_id", { null: false });
      t.string("level", { null: false });
      t.datetime("created_at", { null: false });
      t.datetime("updated_at", { null: false });
      t.index(["book_id"], { name: "index_accesses_on_book_id" });
      t.index(["user_id", "book_id"], {
        name: "index_accesses_on_user_id_and_book_id",
        unique: true,
      });
      t.index(["user_id"], { name: "index_accesses_on_user_id" });
    });

    await this.createTable("accounts", { force: "cascade" }, (t) => {
      t.string("name", { null: false });
      t.string("join_code", { null: false });
      t.datetime("created_at", { null: false });
      t.datetime("updated_at", { null: false });
    });

    await this.createTable("action_text_markdowns", { force: "cascade" }, (t) => {
      t.string("record_type", { null: false });
      t.integer("record_id", { null: false });
      t.string("name", { null: false });
      t.text("content", { default: "", null: false });
      t.datetime("created_at", { null: false });
      t.datetime("updated_at", { null: false });
      t.index(["record_type", "record_id"], { name: "index_action_text_markdowns_on_record" });
    });

    await this.createTable("active_storage_attachments", { force: "cascade" }, (t) => {
      t.string("name", { null: false });
      t.string("record_type", { null: false });
      t.bigint("record_id", { null: false });
      t.bigint("blob_id", { null: false });
      t.datetime("created_at", { null: false });
      t.string("slug");
      t.index(["blob_id"], { name: "index_active_storage_attachments_on_blob_id" });
      t.index(["record_type", "record_id", "name", "blob_id"], {
        name: "index_active_storage_attachments_uniqueness",
        unique: true,
      });
      t.index(["slug"], { name: "index_active_storage_attachments_on_slug", unique: true });
    });

    await this.createTable("active_storage_blobs", { force: "cascade" }, (t) => {
      t.string("key", { null: false });
      t.string("filename", { null: false });
      t.string("content_type");
      t.text("metadata");
      t.string("service_name", { null: false });
      t.bigint("byte_size", { null: false });
      t.string("checksum");
      t.datetime("created_at", { null: false });
      t.index(["key"], { name: "index_active_storage_blobs_on_key", unique: true });
    });

    await this.createTable("active_storage_variant_records", { force: "cascade" }, (t) => {
      t.bigint("blob_id", { null: false });
      t.string("variation_digest", { null: false });
      t.index(["blob_id", "variation_digest"], {
        name: "index_active_storage_variant_records_uniqueness",
        unique: true,
      });
    });

    await this.createTable("books", { force: "cascade" }, (t) => {
      t.string("title", { null: false });
      t.datetime("created_at", { null: false });
      t.datetime("updated_at", { null: false });
      t.string("subtitle");
      t.string("author");
      t.boolean("published", { default: false, null: false });
      t.string("slug", { null: false });
      t.boolean("everyone_access", { default: true, null: false });
      t.index(["published"], { name: "index_books_on_published" });
    });

    await this.createTable("edits", { force: "cascade" }, (t) => {
      t.integer("leaf_id", { null: false });
      t.string("leafable_type", { null: false });
      t.integer("leafable_id", { null: false });
      t.string("action", { null: false });
      t.datetime("created_at", { null: false });
      t.datetime("updated_at", { null: false });
      t.index(["leaf_id"], { name: "index_edits_on_leaf_id" });
      t.index(["leafable_type", "leafable_id"], { name: "index_edits_on_leafable" });
    });

    await this.createTable("leaves", { force: "cascade" }, (t) => {
      t.integer("book_id", { null: false });
      t.string("leafable_type", { null: false });
      t.integer("leafable_id", { null: false });
      t.float("position_score", { null: false });
      t.string("status", { null: false });
      t.datetime("created_at", { null: false });
      t.datetime("updated_at", { null: false });
      t.string("title", { null: false });
      t.index(["book_id"], { name: "index_leaves_on_book_id" });
      t.index(["leafable_type", "leafable_id"], { name: "index_leafs_on_leafable" });
    });

    await this.createTable("pages", { force: "cascade" }, (t) => {
      t.datetime("created_at", { null: false });
      t.datetime("updated_at", { null: false });
    });

    await this.createTable("pictures", { force: "cascade" }, (t) => {
      t.datetime("created_at", { null: false });
      t.datetime("updated_at", { null: false });
      t.string("caption");
    });

    await this.createTable("sections", { force: "cascade" }, (t) => {
      t.datetime("created_at", { null: false });
      t.datetime("updated_at", { null: false });
      t.string("theme");
    });

    await this.createTable("sessions", { force: "cascade" }, (t) => {
      t.integer("user_id", { null: false });
      t.string("token", { null: false });
      t.string("ip_address");
      t.string("user_agent");
      t.datetime("last_active_at", { null: false });
      t.datetime("created_at", { null: false });
      t.datetime("updated_at", { null: false });
      t.index(["token"], { name: "index_sessions_on_token", unique: true });
      t.index(["user_id"], { name: "index_sessions_on_user_id" });
    });

    await this.createTable("users", { force: "cascade" }, (t) => {
      t.string("name", { null: false });
      t.string("email_address", { null: false });
      t.string("password_digest", { null: false });
      t.integer("role", { null: false });
      t.boolean("active", { default: true });
      t.datetime("created_at", { null: false });
      t.datetime("updated_at", { null: false });
      t.index(["email_address"], { name: "index_users_on_email_address", unique: true });
      t.index(["name"], { name: "index_users_on_name", unique: true });
    });

    await this.addForeignKey("accesses", "books");
    await this.addForeignKey("accesses", "users");
    await this.addForeignKey("active_storage_attachments", "active_storage_blobs", {
      column: "blob_id",
    });
    await this.addForeignKey("active_storage_variant_records", "active_storage_blobs", {
      column: "blob_id",
    });
    await this.addForeignKey("edits", "leaves");
    await this.addForeignKey("leaves", "books");
    await this.addForeignKey("sessions", "users");
  }
}
