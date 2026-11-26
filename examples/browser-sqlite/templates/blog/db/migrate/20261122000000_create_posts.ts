import { Migration } from "@blazetrails/activerecord";

export class CreatePosts extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createTable("posts", (t) => {
      t.string("title", { null: false });
      t.text("body");
      t.boolean("published", { default: false, null: false });
      t.integer("comments_count", { default: 0, null: false });
      t.timestamps();
    });
  }
}
