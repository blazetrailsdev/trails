import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../../base.js";
import { queryConstraints } from "../../../persistence.js";

export class ShardedCommentDestroyAsync extends Base {
  static _tableName = "sharded_comments";
  static {
    registerConstant("Sharded::CommentDestroyAsync", this);
  }

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.belongsTo("blogPost", {
      className: "Sharded::BlogPostDestroyAsync",
      dependent: "destroy",
      foreignKey: ["blog_id", "blog_post_id"],
    });
    this.belongsTo("blogPostById", {
      className: "Sharded::BlogPostDestroyAsync",
      foreignKey: "blog_post_id",
    });
    this.belongsTo("blog", { className: "Sharded::Blog" });
  }
}
