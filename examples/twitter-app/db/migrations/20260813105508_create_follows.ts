import { Migration } from "@blazetrails/activerecord";

export class CreateFollows extends Migration {
  async change(): Promise<void> {
    await this.createTable("follows", (t) => {
      t.integer("follower_id");
      t.integer("followee_id");
      t.timestamps();
      t.index(["follower_id", "followee_id"], { unique: true });
    });
  }
}
