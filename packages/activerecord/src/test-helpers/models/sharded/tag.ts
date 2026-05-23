// vendor/rails/activerecord/test/models/sharded/tag.rb
import { Base } from "../../../base.js";
import { queryConstraints } from "../../../persistence.js";

export class ShardedTag extends Base {
  static _tableName = "sharded_tags";

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.hasMany("blogPostTags", {
      className: "ShardedBlogPostTag",
      foreignKey: ["blog_id", "tag_id"],
    });
    this.hasMany("blogPosts", { through: "blogPostTags", className: "ShardedBlogPost" });
  }
}
