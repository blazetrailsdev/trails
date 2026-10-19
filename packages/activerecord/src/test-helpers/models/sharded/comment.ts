import {
  Module,
  rbModConstSet,
  registerConstant,
  registeredConstant,
} from "@blazetrails/ruby-compat";
import { registerModel } from "../../../associations.js";
import { Base } from "../../../base.js";
import { queryConstraints } from "../../../persistence.js";
import type { ShardedBlog } from "./blog.js";
import type { ShardedBlogPost } from "./blog-post.js";

const Sharded = (registeredConstant("Sharded") as Module | undefined) ?? new Module();
registerConstant("Sharded", Sharded);

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ShardedComment extends Base {
  declare blog_id: number;
  declare blog_post_id: number;
  declare body: string;

  static _tableName = "sharded_comments";
  static {
    registerModel(rbModConstSet(Sharded, "Comment", this));
  }

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.belongsTo("blogPost");
    this.belongsTo("blogPostById", {
      className: "Sharded::BlogPost",
      foreignKey: "blog_post_id",
      primaryKey: "id",
    });
    this.belongsTo("blog");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ShardedComment {
  get blogPost(): ShardedBlogPost | null | Promise<ShardedBlogPost | null>;
  set blogPost(value: ShardedBlogPost | null);
  get blogPostById(): ShardedBlogPost | null | Promise<ShardedBlogPost | null>;
  set blogPostById(value: ShardedBlogPost | null);
  get blog(): ShardedBlog | null | Promise<ShardedBlog | null>;
  set blog(value: ShardedBlog | null);
}
