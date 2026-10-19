import {
  Module,
  rbModConstSet,
  registerConstant,
  registeredConstant,
} from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../../associations/collection-proxy.js";
import { registerModel } from "../../../associations.js";
import { Base } from "../../../base.js";
import { queryConstraints } from "../../../persistence.js";
import type { ShardedBlogPost } from "./blog-post.js";
import type { ShardedBlogPostTag } from "./blog-post-tag.js";

const Sharded = (registeredConstant("Sharded") as Module | undefined) ?? new Module();
registerConstant("Sharded", Sharded);

export class ShardedTag extends Base {
  declare blogPostTags: AssociationProxy<ShardedBlogPostTag>;
  declare blogPosts: AssociationProxy<ShardedBlogPost>;
  declare blog_id: number;
  declare name: string;

  static _tableName = "sharded_tags";
  static {
    registerModel(rbModConstSet(Sharded, "Tag", this));
  }

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.hasMany("blogPostTags");
    this.hasMany("blogPosts", { through: "blogPostTags" });
  }
}
