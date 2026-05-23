// vendor/rails/activerecord/test/models/sharded/comment_destroy_async.rb
import { Base } from "../../../base.js";
import { queryConstraints } from "../../../persistence.js";

export class ShardedCommentDestroyAsync extends Base {
  static _tableName = "sharded_comments";

  static {
    queryConstraints.call(this, "blog_id", "id");

    // Rails: dependent: :destroy_async — using "destroy" until AssociationOptions.dependent is widened
    this.belongsTo("blogPost", {
      className: "ShardedBlogPostDestroyAsync",
      dependent: "destroy",
      foreignKey: ["blog_id", "blog_post_id"],
    });
    this.belongsTo("blogPostById", {
      className: "ShardedBlogPostDestroyAsync",
      foreignKey: "blog_post_id",
    });
    this.belongsTo("blog", { className: "ShardedBlog" });
  }
}
