import { Migration } from "@blazetrails/activerecord";

export class CreateTrails extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createTable("trails", (t) => {
      t.string("name");
      t.integer("length");
      t.timestamps();
    });
  }
}
