import "../../../destroy-association-async-job.js";
import { registerModel } from "../../../associations.js";
import { Base } from "../../../base.js";
import { queryConstraints } from "../../../persistence.js";
import type { ShardedBlogPostDestroyAsync } from "./blog-post-destroy-async.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ShardedCommentDestroyAsync extends Base {
  static _tableName = "sharded_comments";
  static {
    registerModel("Sharded::CommentDestroyAsync", this);
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
