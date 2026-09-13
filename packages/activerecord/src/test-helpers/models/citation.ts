import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Book } from "./book.js";
import { Base } from "../../base.js";

export class Citation extends Base {
  declare citations: AssociationProxy<Citation>;
  declare book1_id: bigint;
  declare book2_id: bigint;
  declare citation_id: bigint;

  static {
    this.belongsTo("book", { foreignKey: "book1_id", inverseOf: "citations", touch: true });
    this.belongsTo("referenceOf", { className: "Book", foreignKey: "book2_id" });
    this.hasMany("citations");
  }
}
export interface Citation {
  get book(): Book | null | Promise<Book | null>;
  set book(value: Book | null);
  get referenceOf(): Book | null | Promise<Book | null>;
  set referenceOf(value: Book | null);
}
