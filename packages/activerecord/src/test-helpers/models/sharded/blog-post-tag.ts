import {
  Module,
  rbModConstSet,
  registerConstant,
  registeredConstant,
} from "@blazetrails/ruby-compat";
import { registerModel } from "../../../associations.js";
import { Base } from "../../../base.js";
import { queryConstraints } from "../../../persistence.js";
import type { ShardedBlogPost } from "./blog-post.js";
import type { ShardedTag } from "./tag.js";

const Sharded = (registeredConstant("Sharded") as Module | undefined) ?? new Module();
registerConstant("Sharded", Sharded);

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ShardedBlogPostTag extends Base {
  static _tableName = "sharded_blog_posts_tags";
  static {
    registerModel(rbModConstSet(Sharded, "BlogPostTag", this));
  }

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.belongsTo("blogPost");
    this.belongsTo("tag");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ShardedBlogPostTag {
  get blogPost(): ShardedBlogPost | null | Promise<ShardedBlogPost | null>;
  set blogPost(value: ShardedBlogPost | null);
  get tag(): ShardedTag | null | Promise<ShardedTag | null>;
  set tag(value: ShardedTag | null);
}
