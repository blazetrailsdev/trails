import type { Book } from "./book.js";
// vendor/rails/activerecord/test/models/paragraph.rb
import { Base } from "../../base.js";

export class Paragraph extends Base {
  declare book: Book | null;
  declare loadBelongsTo: (name: "book") => Promise<Book | null>;
  declare book_id: number;

  static {
    this.belongsTo("book");
  }
}
