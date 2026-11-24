import { Migration } from "@blazetrails/activerecord";

export class CreateTags extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createTable("tags", (t) => {
      t.string("name", { null: false });
      t.timestamps();
    });
    await this.addIndex("tags", "name", { unique: true });

    await this.createTable("taggings", (t) => {
      t.references("bookmark", { null: false, foreignKey: true });
      t.references("tag", { null: false, foreignKey: true });
      t.timestamps();
    });
    await this.addIndex("taggings", ["bookmark_id", "tag_id"], { unique: true });
  }
}
