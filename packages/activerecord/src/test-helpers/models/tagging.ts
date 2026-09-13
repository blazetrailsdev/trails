import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { OrderedTag } from "./tag.js";
import type { Tag } from "./tag.js";
import { Base } from "../../base.js";
import { throwAbort } from "@blazetrails/activesupport";

export class Tagging extends Base {
  declare tag: Tag | null | Promise<Tag | null>;
  declare superTag: Tag | null | Promise<Tag | null>;
  declare invalidTag: Tag | null | Promise<Tag | null>;
  declare orderedTag: OrderedTag | null | Promise<OrderedTag | null>;
  declare blueTag: Tag | null | Promise<Tag | null>;
  declare tagWithPrimaryKey: Tag | null | Promise<Tag | null>;
  declare things: AssociationProxy<Base>;
  declare comment: string;
  declare super_tag_id: number;
  declare "type": string;

  declare tag_id: number;
  declare taggable_id: number;
  declare taggable_type: string;
  declare taggable: Base | null | Promise<Base | null>;

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

export class IndestructibleTagging extends Tagging {
  static {
    this.beforeDestroy(() => throwAbort());
  }
}
