import { Migration } from "@blazetrails/activerecord";

export class CreateMessages extends Migration.get(6.1) {
  async change(): Promise<void> {
    await this.createTable("messages", {}, (t) => {
      t.text("content");

      t.timestamps();
    });
  }
}
