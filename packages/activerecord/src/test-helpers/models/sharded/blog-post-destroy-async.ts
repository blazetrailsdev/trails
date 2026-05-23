// vendor/rails/activerecord/test/models/sharded/blog_post_destroy_async.rb
import { Base } from "../../../base.js";
import { queryConstraints } from "../../../persistence.js";

export class ShardedBlogPostDestroyAsync extends Base {
  static _tableName = "sharded_blog_posts";

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.belongsTo("blog", { className: "ShardedBlog" });
    // Rails: dependent: :destroy_async — using "destroy" until AssociationOptions.dependent is widened
    this.hasMany("comments", {
      className: "ShardedCommentDestroyAsync",
      dependent: "destroy",
      foreignKey: ["blog_id", "blog_post_id"],
    });
    this.hasMany("blogPostTags", {
      className: "ShardedBlogPostTag",
      foreignKey: ["blog_id", "blog_post_id"],
    });
    // Rails: dependent: :destroy_async on tags through blogPostTags
    this.hasMany("tags", {
      through: "blogPostTags",
      className: "ShardedTag",
      dependent: "destroy",
    });
  }
}
