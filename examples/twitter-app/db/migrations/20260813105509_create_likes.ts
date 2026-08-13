import { Migration } from "@blazetrails/activerecord";

export class CreateLikes extends Migration {
  async change(): Promise<void> {
    await this.createTable("likes", (t) => {
      t.integer("user_id");
      t.integer("tweet_id");
      t.timestamps();
      t.index(["user_id", "tweet_id"], { unique: true });
    });
  }
}
