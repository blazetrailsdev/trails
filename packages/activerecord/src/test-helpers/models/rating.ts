// vendor/rails/activerecord/test/models/rating.rb
import { Base } from "../../base.js";

export class Rating extends Base {
  static {
    this.belongsTo("comment");
    this.hasMany("taggings", { as: "taggable" });
    this.hasMany("taggingsWithoutTag", {
      scope: (q: any) => q.leftJoins("tag").where({ "tags.id": [null, 0] }),
      as: "taggable",
      className: "Tagging",
    });
    this.hasMany("taggingsWithNoTag", {
      scope: (q: any) =>
        q.joins("LEFT OUTER JOIN tags ON tags.id = taggings.tag_id").where({ "tags.id": null }),
      as: "taggable",
      className: "Tagging",
    });
  }
}
