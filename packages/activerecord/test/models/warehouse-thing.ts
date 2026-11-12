import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";

export class WarehouseThing extends Base {
  static _tableName = "warehouse-things";

  static {
    this.validates("value", { uniqueness: true });
  }
}
constSet(TopLevel, "WarehouseThing", WarehouseThing);
DescendantsTracker.registerSubclass(Base, WarehouseThing);
