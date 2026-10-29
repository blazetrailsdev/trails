import { registerModel } from "../../../associations.js";
import { Base } from "../../../base.js";
import type { AssociationProxy } from "../../../associations/collection-proxy.js";
import { queryConstraints } from "../../../persistence.js";
import type { ShardedTag } from "./tag.js";

export class ShardedBlogPostDestroyAsync extends Base {
  declare tags: AssociationProxy<ShardedTag>;

  static _tableName = "sharded_blog_posts";
  static {
    registerModel("Sharded::BlogPostDestroyAsync", this);
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
