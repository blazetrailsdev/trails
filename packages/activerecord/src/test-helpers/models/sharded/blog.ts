import { registerConstant } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../../associations/collection-proxy.js";
import { Base } from "../../../base.js";
import type { ShardedBlogPost } from "./blog-post.js";
import type { ShardedComment } from "./comment.js";

export class ShardedBlog extends Base {
  declare blogPosts: AssociationProxy<ShardedBlogPost>;
  declare commentsViaPosts: AssociationProxy<ShardedComment>;
  declare name: string;

  static _tableName = "sharded_blogs";
  static {
    registerConstant("Sharded::Blog", this);
  }

  static {
    this.hasMany("blogPosts", { className: "Sharded::BlogPost", foreignKey: "blog_id" });
    this.hasMany("commentsViaPosts", {
      through: "blogPosts",
      source: "commentsWithCompositePk",
      className: "Sharded::Comment",
    });
  }
}
