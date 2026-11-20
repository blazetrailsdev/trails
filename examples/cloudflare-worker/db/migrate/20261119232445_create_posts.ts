import { Migration } from "@blazetrails/activerecord";

export class CreatePosts extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createTable("posts", (t) => {
      t.string("title");

      t.timestamps();
    });
  }
}
