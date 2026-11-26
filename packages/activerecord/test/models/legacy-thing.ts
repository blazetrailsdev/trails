import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class LegacyThing extends Base {
  declare tps_report_number: number;
  declare version: number;

  static {
    this.lockingColumn = "version";
  }
}
constSet(TopLevel, "LegacyThing", LegacyThing);
DescendantsTracker.registerSubclass(Base, LegacyThing);
