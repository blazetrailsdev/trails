import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";
import type { Book } from "./book.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class BookIdentifier extends Base {
  static {
    this.belongsTo("book");
  }
}
constSet(TopLevel, "BookIdentifier", BookIdentifier);
DescendantsTracker.registerSubclass(Base, BookIdentifier);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface BookIdentifier {
  get book(): Book | null | Promise<Book | null>;
  set book(value: Book | null);
}
