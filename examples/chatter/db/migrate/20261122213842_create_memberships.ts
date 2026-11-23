import { Migration } from "@blazetrails/activerecord";

export class CreateMemberships extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createTable("memberships", (t) => {
      t.references("room", { null: false, foreignKey: true });
      t.references("user", { null: false, foreignKey: true });
      t.datetime("last_read_at");

      t.timestamps();
    });
    await this.addIndex("memberships", ["room_id", "user_id"], { unique: true });
  }
}
