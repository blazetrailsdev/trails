import { Migration } from "@blazetrails/activerecord";

export class CreateMessages extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createTable("messages", (t) => {
      t.references("room", { null: false, foreignKey: true });
      t.references("user", { null: false, foreignKey: true });
      t.references("parent", { foreignKey: { toTable: "messages" } });
      t.text("body");
      t.integer("replies_count", { null: false, default: 0 });

      t.timestamps();
    });
  }
}
