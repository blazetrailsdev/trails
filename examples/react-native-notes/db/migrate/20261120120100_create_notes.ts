import { Migration } from "@blazetrails/activerecord";

export class CreateNotes extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createTable("notes", (t) => {
      t.references("notebook", { null: false, foreignKey: true });
      t.string("title", { null: false });
      t.text("body");
      t.boolean("pinned", { default: false, null: false });

      t.timestamps();
    });
  }
}
