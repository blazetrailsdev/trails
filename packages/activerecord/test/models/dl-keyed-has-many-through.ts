import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class DlKeyedHasManyThrough extends Base {
  declare through_key: number;

  static {
    this.primaryKey = "through_key";
  }
}
constSet(TopLevel, "DlKeyedHasManyThrough", DlKeyedHasManyThrough);
DescendantsTracker.registerSubclass(Base, DlKeyedHasManyThrough);
