import { Migration } from "@blazetrails/activerecord";

export class CreateUsers extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createTable("users", (t) => {
      t.string("email_address", { null: false });
      t.string("name");

      t.timestamps();
    });
    await this.addIndex("users", "email_address", { unique: true });
  }
}
