import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Post } from "./post.js";
import type { Tagging } from "./tagging.js";
import { Base } from "../../base.js";

export class Tag extends Base {
  declare taggings: AssociationProxy<Tagging>;
  declare taggables: AssociationProxy<Base>;
  declare tagging: Tagging | null;
  declare taggedPosts: AssociationProxy<Post>;
  declare nullTaggings: AssociationProxy<Tagging>;
  declare nullTaggedPosts: AssociationProxy<Post>;
  declare loadHasOne: (name: "tagging") => Promise<Tagging | null>;
  declare name: string;
  declare taggings_count: number | null;

  static {
    this.hasMany("taggings");
    this.hasMany("taggables", { through: "taggings" });
    this.hasOne("tagging");
    this.hasMany("taggedPosts", { through: "taggings", source: "taggable", sourceType: "Post" });

    this.hasMany("nullTaggings", (q: any) => q.none(), { className: "Tagging" });
    this.hasMany("nullTaggedPosts", {
      through: "nullTaggings",
      source: "taggable",
      sourceType: "Post",
    });
  }
}

export class OrderedTag extends Tag {
  declare orderedTaggings: AssociationProxy<Tagging>;
  declare taggedPosts: AssociationProxy<Post>;
  declare loadHasOne: (name: "tagging") => Promise<Tagging | null>;

  static {
    this._tableName = "tags";
    this.hasMany("orderedTaggings", (q: any) => q.order("taggings.id DESC"), {
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
