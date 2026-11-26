import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class WarehouseThing extends Base {
  static tableName = "warehouse-things";

  static {
    this.validates("value", { uniqueness: true });
  }
}
constSet(TopLevel, "WarehouseThing", WarehouseThing);
DescendantsTracker.registerSubclass(Base, WarehouseThing);
