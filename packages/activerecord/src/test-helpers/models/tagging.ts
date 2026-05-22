// vendor/rails/activerecord/test/models/tagging.rb
import { Base } from "../../base.js";

export class Tagging extends Base {
  static {
    this.belongsTo("tag", { scope: (q: any) => q.includes("tagging") });
    this.belongsTo("superTag", { className: "Tag", foreignKey: "super_tag_id" });
    this.belongsTo("invalidTag", { className: "Tag", foreignKey: "tag_id" });
    this.belongsTo("orderedTag", { className: "OrderedTag", foreignKey: "tag_id" });
    this.belongsTo("blueTag", {
      scope: (q: any) => q.where({ tags: { name: "Blue" } }),
      className: "Tag",
      foreignKey: "tag_id",
    });
    this.belongsTo("tagWithPrimaryKey", {
      className: "Tag",
      foreignKey: "tag_id",
      primaryKey: "custom_primary_key",
    });
    this.belongsTo("taggable", { polymorphic: true, counterCache: "tags_count" });
    this.hasMany("things", { through: "taggable" });
  }
}

export class IndestructibleTagging extends Tagging {
  static {
    this.beforeDestroy(() => false as const);
  }
}
