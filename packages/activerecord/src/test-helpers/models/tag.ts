// vendor/rails/activerecord/test/models/tag.rb
import { Base } from "../../base.js";

export class Tag extends Base {
  static {
    this.hasMany("taggings");
    this.hasMany("taggables", { through: "taggings" });
    this.hasOne("tagging");
    this.hasMany("taggedPosts", { through: "taggings", source: "taggable", sourceType: "Post" });

    // Defined inline in join_model_test.rb's
    // test_has_many_polymorphic_associations_merges_through_scope; carried on the
    // canonical model so the test needn't mutate the shared class at runtime.
    this.hasMany("nullTaggings", { scope: (q: any) => q.none(), className: "Tagging" });
    this.hasMany("nullTaggedPosts", {
      through: "nullTaggings",
      source: "taggable",
      sourceType: "Post",
    });
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
