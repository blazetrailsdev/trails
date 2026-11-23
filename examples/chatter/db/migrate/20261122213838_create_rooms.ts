import { Migration } from "@blazetrails/activerecord";

export class CreateRooms extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createTable("rooms", (t) => {
      t.string("name");
      t.string("kind", { null: false, default: "channel" });
      t.string("topic");
      t.references("creator", { null: false, foreignKey: { toTable: "users" } });

      t.timestamps();
    });
    await this.addIndex("rooms", ["kind", "name"], { unique: true });
  }
}
