import { Schema } from "@blazetrails/activerecord";

export async function loadCableSchema(): Promise<void> {
  await Schema.get(7.1).define({ version: 1 }, async (schema) => {
    await schema.createTable("solid_cable_messages", { force: "cascade" }, (t) => {
      t.binary("channel", { limit: 1024, null: false });
      t.binary("payload", { limit: 536870912, null: false });
      t.datetime("created_at", { null: false });
      t.integer("channel_hash", { limit: 8, null: false });
      t.index(["channel"], { name: "index_solid_cable_messages_on_channel" });
      t.index(["channel_hash"], { name: "index_solid_cable_messages_on_channel_hash" });
      t.index(["created_at"], { name: "index_solid_cable_messages_on_created_at" });
    });
  });
}
