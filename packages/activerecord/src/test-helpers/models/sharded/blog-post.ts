import {
  Module,
  rbModConstSet,
  rbModName,
  registerConstant,
  registeredConstant,
} from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../../associations/collection-proxy.js";
import { registerModel } from "../../../associations.js";
import { Base } from "../../../base.js";
import { queryConstraints } from "../../../persistence.js";
import type { ShardedBlog } from "./blog.js";
import type { ShardedBlogPostTag } from "./blog-post-tag.js";
import type { ShardedComment } from "./comment.js";
import type { ShardedTag } from "./tag.js";

const Sharded = (registeredConstant("Sharded") as Module | undefined) ?? new Module();
registerConstant("Sharded", Sharded);

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ShardedBlogPost extends Base {
  declare comments: AssociationProxy<ShardedComment>;
  declare deleteComments: AssociationProxy<ShardedComment>;
  declare children: AssociationProxy<ShardedBlogPost>;
  declare blogPostTags: AssociationProxy<ShardedBlogPostTag>;
  declare tags: AssociationProxy<ShardedTag>;
  declare blog_id: number;
  declare parent_id: number;
  declare parent_type: string;
  declare revision: number;
  declare title: string;

  static _tableName = "sharded_blog_posts";
  static {
    registerModel(rbModConstSet(Sharded, "BlogPost", this));
  }

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.belongsTo("parent", { className: rbModName(this)!, polymorphic: true });
    this.belongsTo("blog");
    this.hasMany("comments");
    this.hasMany("deleteComments", { className: "Sharded::Comment", dependent: "deleteAll" });
    this.hasMany("children", { className: rbModName(this)!, as: "parent" });
    this.hasMany("blogPostTags");
    this.hasMany("tags", { through: "blogPostTags" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ShardedBlogPost {
  get parent(): Base | null | Promise<Base | null>;
  set parent(value: Base | null);
  get blog(): ShardedBlog | null | Promise<ShardedBlog | null>;
  set blog(value: ShardedBlog | null);
}
