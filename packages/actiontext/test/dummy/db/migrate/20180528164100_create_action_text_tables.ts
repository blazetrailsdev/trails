import { Migration } from "@blazetrails/activerecord";

export class CreateActionTextTables extends Migration.get(6.0) {
  async change(): Promise<void> {
    await this.createTable("action_text_rich_texts", {}, (t) => {
      t.string("name", { null: false });
      t.text("body", { size: "long" });
      t.references("record", { null: false, polymorphic: true, index: false });

      t.timestamps();

      t.index(["record_type", "record_id", "name"], {
        name: "index_action_text_rich_texts_uniqueness",
        unique: true,
      });
    });
  }
}
