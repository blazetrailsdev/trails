import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat";
import { Sharded } from "./namespace.js";
import { Base } from "../../../lib/base.js";

export class ShardedBlog extends Base {
  declare name: string;

  static _tableName = "sharded_blogs";
  static {
    constSet(Sharded, "Blog", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
}
