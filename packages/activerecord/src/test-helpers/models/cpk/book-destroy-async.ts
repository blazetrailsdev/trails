import { Base } from "../../../base.js";

export class CpkBookDestroyAsync extends Base {
  static _tableName = "cpk_books";

  static {
    // Rails: dependent: :destroy_async — not yet in AssociationOptions.dependent type
    this.hasMany("chapters", {
      foreignKey: ["author_id", "book_id"],
      className: "CpkChapterDestroyAsync",
      dependent: "destroy",
    });
  }
}
