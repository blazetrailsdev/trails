import {
  Module,
  rbModConstSet,
  registerConstant,
  registeredConstant,
} from "@blazetrails/ruby-compat";
import { registerModel } from "../../../associations.js";
import { Base } from "../../../base.js";
import { queryConstraints } from "../../../persistence.js";

const Sharded = (registeredConstant("Sharded") as Module | undefined) ?? new Module();
registerConstant("Sharded", Sharded);

export class ShardedCommentDestroyAsync extends Base {
  static _tableName = "sharded_comments";
  static {
    registerModel(rbModConstSet(Sharded, "CommentDestroyAsync", this));
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
