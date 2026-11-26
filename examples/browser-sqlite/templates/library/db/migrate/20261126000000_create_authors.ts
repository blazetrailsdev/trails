import { Migration } from "@blazetrails/activerecord";

export class CreateAuthors extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createTable("authors", (t) => {
      t.string("name", { null: false });
      t.integer("born");
      t.integer("books_count", { default: 0, null: false });
      t.timestamps();
    });
    await this.addIndex("authors", "name", { unique: true });
  }
}
