import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import type { Book } from "./book.js";
import { Base } from "../../lib/base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Paragraph extends Base {
  declare book_id: number;

  static {
    this.belongsTo("book");
  }
}
constSet(TopLevel, "Paragraph", Paragraph);
DescendantsTracker.registerSubclass(Base, Paragraph);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Paragraph {
  get book(): Book | null | Promise<Book | null>;
  set book(value: Book | null);
}
