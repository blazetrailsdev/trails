import { registerConstant } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../../associations/collection-proxy.js";
import { Base } from "../../../base.js";
import { queryConstraints } from "../../../persistence.js";
import type { ShardedComment } from "./comment.js";

export class ShardedBlogPostWithRevision extends Base {
  declare comments: AssociationProxy<ShardedComment>;

  static _tableName = "sharded_blog_posts";
  static {
    registerConstant("Sharded::BlogPostWithRevision", this);
  }

  static {
    queryConstraints.call(this, "blog_id", "revision", "id");

    this.hasMany("comments", {
      className: "Sharded::Comment",
      primaryKey: ["blog_id", "id"],
      foreignKey: ["blog_id", "blog_post_id"],
    });
  }
}
