import { Migration } from "@blazetrails/activerecord";

export class AddCountersToUsersAndTweets extends Migration {
  async change(): Promise<void> {
    await this.addColumn("users", "tweets_count", "integer", { default: 0, null: false });
    await this.addColumn("tweets", "likes_count", "integer", { default: 0, null: false });
    await this.addColumn("tweets", "replies_count", "integer", { default: 0, null: false });
  }
}
