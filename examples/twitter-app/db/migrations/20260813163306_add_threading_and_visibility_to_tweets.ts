import { Migration } from "@blazetrails/activerecord";

export class AddThreadingAndVisibilityToTweets extends Migration {
  async change(): Promise<void> {
    // Self-referential: a reply belongs to the tweet it answers.
    await this.addColumn("tweets", "reply_to_id", "integer");
    await this.addIndex("tweets", ["reply_to_id"]);

    // Backs `this.enum("visibility", ...)` on Tweet.
    await this.addColumn("tweets", "visibility", "integer", { default: 0, null: false });
  }
}
