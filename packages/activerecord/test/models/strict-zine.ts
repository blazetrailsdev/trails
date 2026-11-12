import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Zine } from "./zine.js";

export class StrictZine extends Zine {
  static {
    this.strictLoadingByDefault = true;
  }
}
constSet(TopLevel, "StrictZine", StrictZine);
DescendantsTracker.registerSubclass(Zine, StrictZine);
