import { Migration } from "@blazetrails/activerecord";

export class AddThemeToBook extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.changeTable("books", (t) => {
      t.string("theme", { default: "blue", null: false });
    });
  }
}
