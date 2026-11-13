import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";

export class PostWithPrefetchedPk extends Base {
  static tableName = "posts";

  static isPrefetchPrimaryKey(): boolean {
    return true;
  }

  static nextSequenceValue() {
    return 123456;
  }
}
constSet(TopLevel, "PostWithPrefetchedPk", PostWithPrefetchedPk);
DescendantsTracker.registerSubclass(Base, PostWithPrefetchedPk);
