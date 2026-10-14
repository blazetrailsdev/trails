import type { Book } from "./book.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Paragraph extends Base {
  declare book_id: number;

  static {
    this.belongsTo("book");
  }
}
registerModel(Paragraph);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Paragraph {
  get book(): Book | null | Promise<Book | null>;
  set book(value: Book | null);
}
