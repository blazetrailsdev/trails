import { registerModel } from "../../../associations.js";
import { Base } from "../../../base.js";
import { queryConstraints } from "../../../persistence.js";

/** @missingRailsArgs belongs_to — CONVERGEABLE port-destroy-association-async-test-and-flip-models */
export class ShardedCommentDestroyAsync extends Base {
  static _tableName = "sharded_comments";
  static {
    registerModel("Sharded::CommentDestroyAsync", this);
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
    this.belongsTo("blog");
  }
}
