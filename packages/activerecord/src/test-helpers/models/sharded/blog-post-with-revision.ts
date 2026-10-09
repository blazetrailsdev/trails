import {
  Module,
  rbModConstSet,
  registerConstant,
  registeredConstant,
} from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../../associations/collection-proxy.js";
import { registerModel } from "../../../associations.js";
import { Base } from "../../../base.js";
import { queryConstraints } from "../../../persistence.js";
import type { ShardedComment } from "./comment.js";

const Sharded = (registeredConstant("Sharded") as Module | undefined) ?? new Module();
registerConstant("Sharded", Sharded);

export class ShardedBlogPostWithRevision extends Base {
  declare comments: AssociationProxy<ShardedComment>;

  static _tableName = "sharded_blog_posts";
  static {
    registerModel(rbModConstSet(Sharded, "BlogPostWithRevision", this));
  }

  static {
    queryConstraints.call(this, "blog_id", "revision", "id");

    this.hasMany("comments", {
      primaryKey: ["blog_id", "id"],
      foreignKey: ["blog_id", "blog_post_id"],
    });
  }
}
