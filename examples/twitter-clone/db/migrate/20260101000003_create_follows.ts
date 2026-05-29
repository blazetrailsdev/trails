import { Migration } from "@blazetrails/activerecord";

export default class CreateFollows extends Migration {
  async change() {
    // follower_id follows followee_id
    await this.createTable("follows", (t) => {
      t.integer("follower_id");
      t.integer("followee_id");
      t.timestamps();
      // Back the model's `validatesUniqueness("followee_id", { scope: "follower_id" })`
      // so a pair can't be followed twice under concurrent requests.
      t.index(["follower_id", "followee_id"], { unique: true });
    });
  }
}
