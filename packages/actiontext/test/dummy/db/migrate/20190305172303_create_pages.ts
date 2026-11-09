import { Migration } from "@blazetrails/activerecord";

export class CreatePages extends Migration.get(6.0) {
  async change(): Promise<void> {
    await this.createTable("pages", {}, (t) => {
      t.string("title");

      t.timestamps();
    });
  }
}
