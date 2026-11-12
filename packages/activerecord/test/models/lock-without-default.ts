import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import { Base } from "../../lib/base.js";

export class LockWithoutDefault extends Base {
  declare title: string;
  declare lock_version: number;
  declare created_at: RubyTime | Temporal.PlainDateTime;
  declare updated_at: RubyTime | Temporal.PlainDateTime;

  static {
    this._tableName = "lock_without_defaults";
    this.attribute("title", "string");
    this.attribute("lock_version", "integer");
    this.attribute("created_at", "datetime");
    this.attribute("updated_at", "datetime");
  }
}
constSet(TopLevel, "LockWithoutDefault", LockWithoutDefault);
DescendantsTracker.registerSubclass(Base, LockWithoutDefault);
