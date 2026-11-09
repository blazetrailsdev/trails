import { Migration } from "@blazetrails/activerecord";

export class CreateMessages extends Migration.get(6.0) {
  async change(): Promise<void> {
    await this.createTable("messages", {}, (t) => {
      t.string("subject");
      t.timestamps();
    });
  }
}
