import { Migration } from "@blazetrails/activerecord";

export class CreateBoards extends Migration.get(6.1) {
  async change(): Promise<void> {
    await this.createTable("boards", {}, (t) => {
      t.string("name");

      t.timestamps();
    });
  }
}
