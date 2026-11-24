import { Migration } from "@blazetrails/activerecord";

export class CreateBookmarks extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createTable("bookmarks", (t) => {
      t.string("title", { null: false });
      t.string("url", { null: false });
      t.text("notes");
      t.datetime("read_at");
      t.datetime("remind_at");
      t.datetime("reminded_at");

      t.timestamps();
    });
    await this.addIndex("bookmarks", "url", { unique: true });
  }
}
