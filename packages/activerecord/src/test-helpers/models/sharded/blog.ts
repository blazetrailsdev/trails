// vendor/rails/activerecord/test/models/sharded/blog.rb
import { Base } from "../../../base.js";

export class ShardedBlog extends Base {
  static _tableName = "sharded_blogs";

  static {
    this.hasMany("blogPosts", { className: "ShardedBlogPost", foreignKey: "blog_id" });
    this.hasMany("commentsViaPosts", {
      through: "blogPosts",
      source: "commentsWithCompositePk",
      className: "ShardedComment",
    });
  }
}
