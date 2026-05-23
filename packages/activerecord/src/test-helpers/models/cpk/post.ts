import { Base } from "../../../base.js";

export class CpkPost extends Base {
  static _tableName = "cpk_posts";

  static {
    this.hasMany("comments", {
      className: "CpkComment",
      foreignKey: ["commentable_title", "commentable_author"],
      as: "commentable",
    });
  }
}
