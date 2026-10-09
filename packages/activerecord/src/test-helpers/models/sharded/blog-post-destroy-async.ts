import { registerModel } from "../../../associations.js";
import { Base } from "../../../base.js";
import { queryConstraints } from "../../../persistence.js";

export class ShardedBlogPostDestroyAsync extends Base {
  static _tableName = "sharded_blog_posts";
  static {
    registerModel("Sharded::BlogPostDestroyAsync", this);
  }

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.belongsTo("blog", { className: "Sharded::Blog" });
    this.hasMany("comments", {
      className: "Sharded::CommentDestroyAsync",
      dependent: "destroy",
      foreignKey: ["blog_id", "blog_post_id"],
    });
    this.hasMany("blogPostTags", {
      className: "Sharded::BlogPostTag",
      foreignKey: ["blog_id", "blog_post_id"],
    });
    this.hasMany("tags", {
      through: "blogPostTags",
      className: "Sharded::Tag",
      dependent: "destroy",
    });
  }
}
