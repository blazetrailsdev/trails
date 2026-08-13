import { Migration } from "@blazetrails/activerecord";

export class CreateTweets extends Migration {
  async change(): Promise<void> {
    await this.createTable("tweets", (t) => {
      t.references("user", { foreignKey: true });
      t.text("body");
      t.timestamps();
    });
  }
}
