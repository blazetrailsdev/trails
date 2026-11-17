import { Migration } from "@blazetrails/activerecord";

export class CreateArticles extends Migration.get(6.1) {
  async change(): Promise<void> {
    await this.createTable("articles", {}, (t) => {
      t.text("body", { null: false });

      t.timestamps();
    });
  }
}
