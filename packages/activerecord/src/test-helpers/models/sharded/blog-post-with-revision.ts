// vendor/rails/activerecord/test/models/sharded/blog_post_with_revision.rb
import { Base } from "../../../base.js";
import { queryConstraints } from "../../../persistence.js";

export class ShardedBlogPostWithRevision extends Base {
  static _tableName = "sharded_blog_posts";

  static {
    queryConstraints.call(this, "blog_id", "revision", "id");

    this.hasMany("comments", {
      className: "ShardedComment",
      primaryKey: ["blog_id", "id"],
      foreignKey: ["blog_id", "blog_post_id"],
    });
  }
}
