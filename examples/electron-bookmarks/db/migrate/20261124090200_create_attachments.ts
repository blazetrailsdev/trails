import { Migration } from "@blazetrails/activerecord";

export class CreateAttachments extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createTable("attachments", (t) => {
      t.references("bookmark", { null: false, foreignKey: true });
      t.string("path", { null: false });
      t.string("name", { null: false });
      t.bigint("byte_size");
      t.timestamps();
    });
  }
}
