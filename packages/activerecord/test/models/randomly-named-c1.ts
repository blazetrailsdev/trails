import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";

export class ClassNameThatDoesNotFollowCONVENTIONS extends Base {
  static _tableName = "randomly_named_table1";
}
constSet(TopLevel, "ClassNameThatDoesNotFollowCONVENTIONS", ClassNameThatDoesNotFollowCONVENTIONS);
DescendantsTracker.registerSubclass(Base, ClassNameThatDoesNotFollowCONVENTIONS);
