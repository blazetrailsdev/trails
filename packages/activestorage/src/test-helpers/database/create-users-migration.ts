import { Migration } from "@blazetrails/activerecord";

export class ActiveStorageCreateUsers extends Migration.get(5.2) {
  async change(): Promise<void> {
    await this.createTable("users", (t) => {
      t.string("name");
      t.integer("group_id");
      t.timestamps();
    });
  }
}
