import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat";
import { Sharded } from "./namespace.js";
import type { AssociationProxy } from "../../../lib/associations/collection-proxy.js";
import { Base } from "../../../lib/base.js";
import { queryConstraints } from "../../../lib/persistence.js";
import type { ShardedComment } from "./comment.js";

export class ShardedBlogPostWithRevision extends Base {
  declare comments: AssociationProxy<ShardedComment>;

  static tableName = "sharded_blog_posts";
  static {
    constSet(Sharded, "BlogPostWithRevision", this);
    DescendantsTracker.registerSubclass(Base, this);
  }

  static {
    queryConstraints.call(this, "blog_id", "revision", "id");

    this.hasMany("comments", {
      primaryKey: ["blog_id", "id"],
      foreignKey: ["blog_id", "blog_post_id"],
    });
  }
}
