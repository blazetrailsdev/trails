import { Migration } from "@blazetrails/activerecord";

export default class CreateLikes extends Migration {
  async change() {
    await this.createTable("likes", (t) => {
      t.integer("user_id");
      t.integer("tweet_id");
      t.timestamps();
      // Back the model's `validatesUniqueness("user_id", { scope: "tweet_id" })`
      // so a user can't like the same tweet twice under concurrent requests.
      t.index(["user_id", "tweet_id"], { unique: true });
    });
  }
}
