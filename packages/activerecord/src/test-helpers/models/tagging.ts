import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { OrderedTag } from "./tag.js";
import type { Tag } from "./tag.js";
import { Base } from "../../base.js";
import { throwAbort } from "@blazetrails/activesupport";

export class Tagging extends Base {
  declare things: AssociationProxy<Base>;
  declare comment: string;
  declare super_tag_id: number;
  declare "type": string;

  declare tag_id: number;
  declare taggable_id: number;
  declare taggable_type: string;

  static {
    this.belongsTo("tag", (q: any) => q.includes(":tagging"));
    this.belongsTo("superTag", { className: "Tag", foreignKey: "super_tag_id" });
    this.belongsTo("invalidTag", { className: "Tag", foreignKey: "tag_id" });
    this.belongsTo("orderedTag", { className: "OrderedTag", foreignKey: "tag_id" });
    this.belongsTo("blueTag", (q: any) => q.where({ tags: { name: "Blue" } }), {
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
export interface Tagging {
  get tag(): Tag | null | Promise<Tag | null>;
  set tag(value: Tag | null);
  get superTag(): Tag | null | Promise<Tag | null>;
  set superTag(value: Tag | null);
  get invalidTag(): Tag | null | Promise<Tag | null>;
  set invalidTag(value: Tag | null);
  get orderedTag(): OrderedTag | null | Promise<OrderedTag | null>;
  set orderedTag(value: OrderedTag | null);
  get blueTag(): Tag | null | Promise<Tag | null>;
  set blueTag(value: Tag | null);
  get tagWithPrimaryKey(): Tag | null | Promise<Tag | null>;
  set tagWithPrimaryKey(value: Tag | null);
  get taggable(): Base | null | Promise<Base | null>;
  set taggable(value: Base | null);
}

export class IndestructibleTagging extends Tagging {
  static {
    this.beforeDestroy(() => throwAbort());
  }
}
