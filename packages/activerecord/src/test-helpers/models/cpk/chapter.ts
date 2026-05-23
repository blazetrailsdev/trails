import { Base } from "../../../base.js";

export class CpkChapter extends Base {
  static _tableName = "cpk_chapters";

  static {
    this._primaryKey = ["author_id", "id"];
    this.belongsTo("book", { className: "CpkBook", foreignKey: ["author_id", "book_id"] });
  }
}
