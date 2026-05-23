// vendor/rails/activerecord/test/models/sharded/blog_post_tag.rb
import { Base } from "../../../base.js";
import { queryConstraints } from "../../../persistence.js";

export class ShardedBlogPostTag extends Base {
  static _tableName = "sharded_blog_posts_tags";

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.belongsTo("blogPost", { className: "ShardedBlogPost" });
    this.belongsTo("tag", { className: "ShardedTag" });
  }
}
