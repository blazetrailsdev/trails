// vendor/rails/activerecord/test/models/sharded/comment.rb
import { Base } from "../../../base.js";
import { queryConstraints } from "../../../persistence.js";

export class ShardedComment extends Base {
  static _tableName = "sharded_comments";

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.belongsTo("blogPost", { className: "ShardedBlogPost" });
    this.belongsTo("blogPostById", {
      className: "ShardedBlogPost",
      foreignKey: "blog_post_id",
      primaryKey: "id",
    });
    this.belongsTo("blogPostWithInverse", {
      className: "ShardedBlogPost",
      foreignKey: ["blog_id", "blog_post_id"],
      primaryKey: ["blog_id", "id"],
      inverseOf: "commentsWithInverse",
    });
    this.belongsTo("blog", { className: "ShardedBlog" });
  }
}
