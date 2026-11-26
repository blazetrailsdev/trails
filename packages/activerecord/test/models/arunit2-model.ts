import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class ARUnit2Model extends Base {
  static {
    this.abstractClass = true;
  }
}
constSet(TopLevel, "ARUnit2Model", ARUnit2Model);
DescendantsTracker.registerSubclass(Base, ARUnit2Model);
