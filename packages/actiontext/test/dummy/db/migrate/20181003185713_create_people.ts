import { Migration } from "@blazetrails/activerecord";

export class CreatePeople extends Migration.get(6.0) {
  async change(): Promise<void> {
    await this.createTable("people", {}, (t) => {
      t.string("name");

      t.timestamps();
    });
  }
}
