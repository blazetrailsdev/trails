import { Migration } from "@blazetrails/activerecord";

export class CreateNotebooks extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createTable("notebooks", (t) => {
      t.string("name", { null: false });

      t.timestamps();
    });
  }
}
