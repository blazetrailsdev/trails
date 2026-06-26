import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { OrderedTag } from "./tag.js";
import type { Tag } from "./tag.js";
// vendor/rails/activerecord/test/models/tagging.rb
import { Base } from "../../base.js";
import { throwAbort } from "@blazetrails/activesupport";

export class Tagging extends Base {
  declare tag: Tag | null;
  declare superTag: Tag | null;
  declare invalidTag: Tag | null;
  declare orderedTag: OrderedTag | null;
  declare blueTag: Tag | null;
  declare tagWithPrimaryKey: Tag | null;
  declare things: AssociationProxy<Base>;
  declare loadBelongsTo: ((name: "tag") => Promise<Tag | null>) &
    ((name: "superTag") => Promise<Tag | null>) &
    ((name: "invalidTag") => Promise<Tag | null>) &
    ((name: "orderedTag") => Promise<OrderedTag | null>) &
    ((name: "blueTag") => Promise<Tag | null>) &
    ((name: "tagWithPrimaryKey") => Promise<Tag | null>) &
    ((name: "taggable") => Promise<Base | null>);
  declare comment: string;
  declare super_tag_id: number;
  declare "type": string;

  declare tag_id: number;
  declare taggable_id: number;
  declare taggable_type: string;
  declare taggable: Base | null;

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
  declare loadBelongsTo: ((name: "tag") => Promise<Tag | null>) &
    ((name: "superTag") => Promise<Tag | null>) &
    ((name: "invalidTag") => Promise<Tag | null>) &
    ((name: "orderedTag") => Promise<OrderedTag | null>) &
    ((name: "blueTag") => Promise<Tag | null>) &
    ((name: "tagWithPrimaryKey") => Promise<Tag | null>) &
    ((name: "taggable") => Promise<Base | null>);

  static {
    this.beforeDestroy(() => throwAbort());
  }
}
