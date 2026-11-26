import { Migration } from "@blazetrails/activerecord";

export class CreateBooks extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createTable("books", (t) => {
      t.references("author", { null: false, foreignKey: true });
      t.string("title", { null: false });
      t.string("isbn", { null: false });
      t.integer("published_year", { null: false });
      t.timestamps();
    });
    await this.addIndex("books", "isbn", { unique: true });
  }
}
