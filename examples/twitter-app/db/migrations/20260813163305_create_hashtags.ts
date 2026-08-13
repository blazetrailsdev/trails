import { Migration } from "@blazetrails/activerecord";

export class CreateHashtags extends Migration {
  async change(): Promise<void> {
    await this.createTable("hashtags", (t) => {
      t.string("name");
      t.timestamps();
      t.index(["name"], { unique: true });
    });

    // `hasAndBelongsToMany` resolves the join table by Rails' alphabetical
    // convention, so this is `hashtags_tweets` with no model of its own.
    await this.createJoinTable("hashtags", "tweets", (t) => {
      t.index(["hashtag_id", "tweet_id"], { unique: true });
    });
  }
}
