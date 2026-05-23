import { Base } from "../../../base.js";

export class CpkAuthor extends Base {
  static _tableName = "cpk_authors";

  static {
    // Rails: dependent: :delete_all — "deleteAll" not yet in AssociationOptions.dependent type
    this.hasMany("books", { className: "CpkBook", foreignKey: "author_id", dependent: "delete" });
  }
}
