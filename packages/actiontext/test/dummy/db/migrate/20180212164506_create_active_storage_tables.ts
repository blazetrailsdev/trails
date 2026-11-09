import { Migration } from "@blazetrails/activerecord";

export class CreateActiveStorageTables extends Migration.get(5.2) {
  async change(): Promise<void> {
    await this.createTable("active_storage_blobs", {}, (t) => {
      t.string("key", { null: false });
      t.string("filename", { null: false });
      t.string("content_type");
      t.text("metadata");
      t.string("service_name", { null: false });
      t.bigint("byte_size", { null: false });
      t.string("checksum", { null: false });
      t.datetime("created_at", { null: false });

      t.index(["key"], { unique: true });
    });

    await this.createTable("active_storage_attachments", {}, (t) => {
      t.string("name", { null: false });
      t.references("record", { null: false, polymorphic: true, index: false });
      t.references("blob", { null: false });

      t.datetime("created_at", { null: false });

      t.index(["record_type", "record_id", "name", "blob_id"], {
        name: "index_active_storage_attachments_uniqueness",
        unique: true,
      });
      t.foreignKey("active_storage_blobs", { column: "blob_id" });
    });

    await this.createTable("active_storage_variant_records", {}, (t) => {
      t.belongsTo("blob", { null: false, index: false });
      t.string("variation_digest", { null: false });

      t.index(["blob_id", "variation_digest"], {
        name: "index_active_storage_variant_records_uniqueness",
        unique: true,
      });
      t.foreignKey("active_storage_blobs", { column: "blob_id" });
    });
  }
}
