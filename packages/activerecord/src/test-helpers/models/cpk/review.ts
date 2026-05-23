import { Base } from "../../../base.js";

export class CpkReview extends Base {
  static _tableName = "cpk_reviews";

  static {
    this.belongsTo("book", {
      className: "CpkBook",
      foreignKey: ["author_id", "number"],
    });
  }
}
