import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat";
import { Sharded } from "./namespace.js";
import "../../../lib/destroy-association-async-job.js";
import { Base } from "../../../lib/base.js";
import type { AssociationProxy } from "../../../lib/associations/collection-proxy.js";
import { queryConstraints } from "../../../lib/persistence.js";
import type { ShardedTag } from "./tag.js";

export class ShardedBlogPostDestroyAsync extends Base {
  declare tags: AssociationProxy<ShardedTag>;

  static tableName = "sharded_blog_posts";
  static {
    constSet(Sharded, "BlogPostDestroyAsync", this);
    DescendantsTracker.registerSubclass(Base, this);
  }

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.belongsTo("blog");
    this.hasMany("comments", {
      className: "Sharded::CommentDestroyAsync",
      dependent: "destroyAsync",
      foreignKey: ["blog_id", "blog_post_id"],
    });
    this.hasMany("blogPostTags", {
      className: "Sharded::BlogPostTag",
      foreignKey: ["blog_id", "blog_post_id"],
    });
    this.hasMany("tags", {
      through: "blogPostTags",
      className: "Sharded::Tag",
      dependent: "destroyAsync",
    });
  }
}
