import { Migration } from "@blazetrails/activerecord";

export class CreateComments extends Migration.get(6.1) {
  async change(): Promise<void> {
    await this.createTable("comments", {}, (t) => {
      t.text("body", { null: false });
      t.references("article", { null: false, foreignKey: true });

      t.timestamps();
    });
  }
}
