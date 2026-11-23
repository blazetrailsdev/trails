import { Migration } from "@blazetrails/activerecord";

export class CreateReactions extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createTable("reactions", (t) => {
      t.references("message", { null: false, foreignKey: true });
      t.references("user", { null: false, foreignKey: true });
      t.string("emoji", { null: false });

      t.timestamps();
    });
    await this.addIndex("reactions", ["message_id", "user_id", "emoji"], { unique: true });
  }
}
