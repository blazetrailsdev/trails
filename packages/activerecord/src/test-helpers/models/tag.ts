// vendor/rails/activerecord/test/models/tag.rb
import { Base } from "../../base.js";

export class Tag extends Base {
  static {
    this.hasMany("taggings");
    this.hasMany("taggables", { through: "taggings" });
    this.hasOne("tagging");
    this.hasMany("taggedPosts", { through: "taggings", source: "taggable", sourceType: "Post" });
  }
}

export class OrderedTag extends Tag {
  static {
    this._tableName = "tags";
    this.hasMany("orderedTaggings", {
      scope: (q: any) => q.order("taggings.id DESC"),
      foreignKey: "tag_id",
      className: "Tagging",
    });
    this.hasMany("taggedPosts", {
      through: "orderedTaggings",
      source: "taggable",
      sourceType: "Post",
    });
  }
}
