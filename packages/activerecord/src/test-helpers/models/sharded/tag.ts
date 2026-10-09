import type { AssociationProxy } from "../../../associations/collection-proxy.js";
import { registerModel } from "../../../associations.js";
import { Base } from "../../../base.js";
import { queryConstraints } from "../../../persistence.js";
import type { ShardedBlogPost } from "./blog-post.js";
import type { ShardedBlogPostTag } from "./blog-post-tag.js";

export class ShardedTag extends Base {
  declare blogPostTags: AssociationProxy<ShardedBlogPostTag>;
  declare blogPosts: AssociationProxy<ShardedBlogPost>;
  declare blog_id: number;
  declare name: string;

  static _tableName = "sharded_tags";
  static {
    registerModel("Sharded::Tag", this);
  }

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.hasMany("blogPostTags", {
      className: "Sharded::BlogPostTag",
      foreignKey: ["blog_id", "tag_id"],
    });
    this.hasMany("blogPosts", { through: "blogPostTags", className: "Sharded::BlogPost" });
  }
}
