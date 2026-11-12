import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";

export class DlKeyedHasManyThrough extends Base {
  declare through_key: number;

  static {
    this.primaryKey = "through_key";
  }
}
constSet(TopLevel, "DlKeyedHasManyThrough", DlKeyedHasManyThrough);
DescendantsTracker.registerSubclass(Base, DlKeyedHasManyThrough);
