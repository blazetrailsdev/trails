import { Migration } from "@blazetrails/activerecord";

export class CreateReviews extends Migration.get(6.0) {
  async change(): Promise<void> {
    await this.createTable("reviews", {}, (t) => {
      t.belongsTo("message", { null: false });
      t.string("author_name", { null: false });
    });
  }
}
