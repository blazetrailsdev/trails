import { Schema } from "@blazetrails/activerecord";

export async function loadCacheSchema(): Promise<void> {
  await Schema.get(7.2).define({ version: 1 }, async (schema) => {
    await schema.createTable("solid_cache_entries", { force: "cascade" }, (t) => {
      t.binary("key", { limit: 1024, null: false });
      t.binary("value", { limit: 536870912, null: false });
      t.datetime("created_at", { null: false });
      t.integer("key_hash", { limit: 8, null: false });
      t.integer("byte_size", { limit: 4, null: false });
      t.index(["byte_size"], { name: "index_solid_cache_entries_on_byte_size" });
      t.index(["key_hash", "byte_size"], {
        name: "index_solid_cache_entries_on_key_hash_and_byte_size",
      });
      t.index(["key_hash"], { name: "index_solid_cache_entries_on_key_hash", unique: true });
    });
  });
}
