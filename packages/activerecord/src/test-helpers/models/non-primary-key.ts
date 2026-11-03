import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import { Base } from "../../base.js";

export class NonPrimaryKey extends Base {
  declare created_at: RubyTime | Temporal.PlainDateTime;
}
constSet(TopLevel, "NonPrimaryKey", NonPrimaryKey);
DescendantsTracker.registerSubclass(Base, NonPrimaryKey);
