import { rbModConstSet, registerConstant, registeredConstant } from "@blazetrails/ruby-compat";
import { registerModel } from "../../../associations.js";
import { Base } from "../../../base.js";

const Sharded = (registeredConstant("Sharded") as object | undefined) ?? {};
registerConstant("Sharded", Sharded);

export class ShardedBlog extends Base {
  declare name: string;

  static _tableName = "sharded_blogs";
  static {
    registerModel(rbModConstSet(Sharded, "Blog", this));
  }
}
