import { DescendantsTracker } from "@blazetrails/activesupport";
import { Admin } from "../admin.js";
import { constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../../lib/base.js";

export class AdminClassNameThatDoesNotFollowCONVENTIONS1 extends Base {
  static tableName = "randomly_named_table2";
  static {
    constSet(Admin, "ClassNameThatDoesNotFollowCONVENTIONS1", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
}

export class AdminClassNameThatDoesNotFollowCONVENTIONS2 extends Base {
  static tableName = "randomly_named_table3";
  static {
    constSet(Admin, "ClassNameThatDoesNotFollowCONVENTIONS2", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
}
