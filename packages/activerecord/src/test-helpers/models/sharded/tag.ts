import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat";
import { Sharded } from "../sharded.js";
import type { AssociationProxy } from "../../../associations/collection-proxy.js";
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
    constSet(Sharded, "Tag", this);
    DescendantsTracker.registerSubclass(Base, this);
  }

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.hasMany("blogPostTags");
    this.hasMany("blogPosts", { through: "blogPostTags" });
  }
}
