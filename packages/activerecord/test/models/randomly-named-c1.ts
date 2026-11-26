import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class ClassNameThatDoesNotFollowCONVENTIONS extends Base {
  static tableName = "randomly_named_table1";
}
constSet(TopLevel, "ClassNameThatDoesNotFollowCONVENTIONS", ClassNameThatDoesNotFollowCONVENTIONS);
DescendantsTracker.registerSubclass(Base, ClassNameThatDoesNotFollowCONVENTIONS);
