import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat";
import { Sharded } from "./namespace.js";
import "../../../lib/destroy-association-async-job.js";
import { Base } from "../../../lib/base.js";
import { queryConstraints } from "../../../lib/persistence.js";
import type { ShardedBlogPostDestroyAsync } from "./blog-post-destroy-async.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ShardedCommentDestroyAsync extends Base {
  static tableName = "sharded_comments";
  static {
    constSet(Sharded, "CommentDestroyAsync", this);
    DescendantsTracker.registerSubclass(Base, this);
  }

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.belongsTo("blogPost", {
      className: "Sharded::BlogPostDestroyAsync",
      dependent: "destroyAsync",
      foreignKey: ["blog_id", "blog_post_id"],
    });
    this.belongsTo("blogPostById", {
      className: "Sharded::BlogPostDestroyAsync",
      foreignKey: "blog_post_id",
    });
    this.belongsTo("blog");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ShardedCommentDestroyAsync {
  get blogPost(): ShardedBlogPostDestroyAsync | null | Promise<ShardedBlogPostDestroyAsync | null>;
  set blogPost(value: ShardedBlogPostDestroyAsync | null);
}
