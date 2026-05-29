import { Migration } from "@blazetrails/activerecord";

export default class CreateUsers extends Migration {
  async change() {
    await this.createTable("users", (t) => {
      t.string("handle");
      t.string("display_name");
      t.string("bio");
      t.timestamps();
      // Back the model's `validatesUniqueness("handle")` with a DB-level
      // guarantee so concurrent creates can't race in duplicate handles.
      t.index(["handle"], { unique: true });
    });
  }
}
