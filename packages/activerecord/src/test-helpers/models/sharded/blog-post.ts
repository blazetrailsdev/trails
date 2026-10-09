import { registerConstant } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../../associations/collection-proxy.js";
import { Base } from "../../../base.js";
import { queryConstraints } from "../../../persistence.js";
import type { ShardedBlog } from "./blog.js";
import type { ShardedBlogPostTag } from "./blog-post-tag.js";
import type { ShardedComment } from "./comment.js";
import type { ShardedTag } from "./tag.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ShardedBlogPost extends Base {
  declare comments: AssociationProxy<ShardedComment>;
  declare deleteComments: AssociationProxy<ShardedComment>;
  declare children: AssociationProxy<ShardedBlogPost>;
  declare blogPostTags: AssociationProxy<ShardedBlogPostTag>;
  declare tags: AssociationProxy<ShardedTag>;
  declare commentsWithCompositePk: AssociationProxy<ShardedComment>;
  declare commentsWithInverse: AssociationProxy<ShardedComment>;
  declare blog_id: number;
  declare parent_id: number;
  declare parent_type: string;
  declare revision: number;
  declare title: string;

  static _tableName = "sharded_blog_posts";
  static {
    registerConstant("Sharded::BlogPost", this);
  }

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.belongsTo("parent", { polymorphic: true });
    this.belongsTo("blog", { className: "Sharded::Blog" });
    this.hasMany("comments", {
      className: "Sharded::Comment",
      foreignKey: ["blog_id", "blog_post_id"],
    });
    this.hasMany("deleteComments", {
      className: "Sharded::Comment",
      foreignKey: ["blog_id", "blog_post_id"],
      dependent: "deleteAll",
    });
    this.hasMany("children", { className: "Sharded::BlogPost", as: "parent" });

    this.hasMany("blogPostTags", {
      className: "Sharded::BlogPostTag",
      foreignKey: ["blog_id", "blog_post_id"],
    });
    this.hasMany("tags", { through: "blogPostTags", className: "Sharded::Tag" });

    this.hasMany("commentsWithCompositePk", {
      className: "Sharded::Comment",
      primaryKey: ["blog_id", "id"],
      foreignKey: ["blog_id", "blog_post_id"],
    });

    this.hasMany("commentsWithInverse", {
      className: "Sharded::Comment",
      foreignKey: ["blog_id", "blog_post_id"],
      inverseOf: "blogPostWithInverse",
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ShardedBlogPost {
  get parent(): Base | null | Promise<Base | null>;
  set parent(value: Base | null);
  get blog(): ShardedBlog | null | Promise<ShardedBlog | null>;
  set blog(value: ShardedBlog | null);
}
