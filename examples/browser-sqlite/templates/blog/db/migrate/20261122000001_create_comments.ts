import { Migration } from "@blazetrails/activerecord";

export class CreateComments extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createTable("comments", (t) => {
      t.references("post", { null: false, foreignKey: true });
      t.string("author", { null: false });
      t.text("body", { null: false });
      t.timestamps();
    });
  }
}
