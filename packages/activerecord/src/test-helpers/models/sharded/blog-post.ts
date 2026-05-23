// vendor/rails/activerecord/test/models/sharded/blog_post.rb
import { Base } from "../../../base.js";
import { queryConstraints } from "../../../persistence.js";

export class ShardedBlogPost extends Base {
  static _tableName = "sharded_blog_posts";

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.belongsTo("parent", { polymorphic: true });
    this.belongsTo("blog", { className: "ShardedBlog" });
    this.hasMany("comments", {
      className: "ShardedComment",
      foreignKey: ["blog_id", "blog_post_id"],
    });
    // Rails: dependent: :delete_all — "deleteAll" not yet in AssociationOptions.dependent type
    this.hasMany("deleteComments", {
      className: "ShardedComment",
      foreignKey: ["blog_id", "blog_post_id"],
      dependent: "delete",
    });
    this.hasMany("children", { className: "ShardedBlogPost", as: "parent" });
    this.hasMany("blogPostTags", {
      className: "ShardedBlogPostTag",
      foreignKey: ["blog_id", "blog_post_id"],
    });
    this.hasMany("tags", { through: "blogPostTags", className: "ShardedTag" });
    this.hasMany("commentsWithCompositePk", {
      className: "ShardedComment",
      primaryKey: ["blog_id", "id"],
      foreignKey: ["blog_id", "blog_post_id"],
    });
    this.hasMany("commentsWithInverse", {
      className: "ShardedComment",
      foreignKey: ["blog_id", "blog_post_id"],
      inverseOf: "blogPostWithInverse",
    });
  }
}
