import { Base } from "../../../base.js";

export class CpkComment extends Base {
  static _tableName = "cpk_comments";

  static {
    this.belongsTo("commentable", {
      className: "CpkPost",
      foreignKey: ["commentable_title", "commentable_author"],
      polymorphic: true,
    });
    this.belongsTo("post", {
      className: "CpkPost",
      foreignKey: ["commentable_title", "commentable_author"],
    });
  }
}
