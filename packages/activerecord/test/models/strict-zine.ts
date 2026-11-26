import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Zine } from "./zine.js";

export class StrictZine extends Zine {
  static {
    this.strictLoadingByDefault = true;
  }
}
constSet(TopLevel, "StrictZine", StrictZine);
DescendantsTracker.registerSubclass(Zine, StrictZine);
