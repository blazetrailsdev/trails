import { Migration } from "@blazetrails/activerecord";

export default class CreateTweets extends Migration {
  async change() {
    await this.createTable("tweets", (t) => {
      t.integer("user_id");
      t.text("body");
      t.timestamps();
    });
  }
}
