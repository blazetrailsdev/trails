import { registerModel } from "../../../associations.js";
import { Base } from "../../../base.js";

export class ShardedBlog extends Base {
  declare name: string;

  static _tableName = "sharded_blogs";
  static {
    registerModel("Sharded::Blog", this);
  }
}
