import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Book } from "./book.js";
import { Base } from "../../base.js";

export class Citation extends Base {
  declare book: Book | null | Promise<Book | null>;
  declare referenceOf: Book | null | Promise<Book | null>;
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
