import { Migration } from "@blazetrails/activerecord";

export class CreateTweets extends Migration.get(8.0) {
  async change() {
    await this.createTable("tweets", (t) => {
      t.integer("user_id");
      t.text("body");
      t.timestamps();
    });
  }
}
