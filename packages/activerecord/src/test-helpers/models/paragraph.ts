import type { Book } from "./book.js";
import { Base } from "../../base.js";

export class Paragraph extends Base {
  declare book_id: number;

  static {
    this.belongsTo("book");
  }
}
export interface Paragraph {
  get book(): Book | null | Promise<Book | null>;
  set book(value: Book | null);
}
